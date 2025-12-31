import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { MailService } from '../src/modules/mail/mail.service';
import { ResponseInterceptor } from '../src/modules/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../src/modules/common/filters/global-exception.filter';
import { AuditService } from '../src/modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { InMemoryRedisService, NoopMailService } from './helpers/fakes';
import { truncateAllTables } from './helpers/db';
import { AuthUser } from '../src/modules/auth/Models/auth-user.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../src/modules/auth/Enum';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Auth password flows (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redis: InMemoryRedisService;

  beforeAll(async () => {
    redis = new InMemoryRedisService();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(MailService)
      .useValue(new NoopMailService())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(
      new GlobalExceptionFilter(
        app.get(AuditService),
        app.get(ConfigService),
      ),
    );
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
    redis.clear();
  });

  it('resets password and revokes old tokens', async () => {
    const suffix = Date.now().toString().slice(-6);
    const email = `rp${suffix}@epn.edu.ec`;
    const password = 'Segura.123';
    const newPassword = 'Segura.456';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password,
        nombre: 'Reset',
        apellido: 'User',
        celular: '0980000000',
      })
      .expect(201);

    const authRepo = dataSource.getRepository(AuthUser);
    await authRepo.update(
      { email },
      {
        rol: RolUsuarioEnum.PASAJERO,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const oldToken = loginRes.body?.data?.token as string;
    expect(oldToken).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await request(app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(200);

    const authUser = await authRepo.findOne({ where: { email } });
    const resetToken = await redis.get(
      `reset:active:${authUser?.id ?? ''}`,
    );
    expect(resetToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
  });

  it('changes password and revokes token on logout', async () => {
    const suffix = Date.now().toString().slice(-6);
    const email = `cp${suffix}@epn.edu.ec`;
    const password = 'Segura.123';
    const newPassword = 'Segura.789';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password,
        nombre: 'Change',
        apellido: 'User',
        celular: '0981111111',
      })
      .expect(201);

    const authRepo = dataSource.getRepository(AuthUser);
    await authRepo.update(
      { email },
      {
        rol: RolUsuarioEnum.PASAJERO,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const token = loginRes.body?.data?.token as string;

    await request(app.getHttpServer())
      .patch('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);

    const loginNew = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    const newToken = loginNew.body?.data?.token as string;

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(401);
  });
});
