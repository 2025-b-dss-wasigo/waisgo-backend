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
const describeAuth = hasTestDb ? describe : describe.skip;

describeAuth('Auth flow (e2e)', () => {
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
  });

  it('registers, logs in, and verifies a user', async () => {
    const suffix = Date.now().toString().slice(-6);
    const email = `t${suffix}@epn.edu.ec`;
    const password = 'Segura.123';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password,
        nombre: 'Juan',
        apellido: 'Perez',
        celular: '0987654321',
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const token = loginRes.body?.data?.token as string;
    expect(token).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/verification/send')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const authRepo = dataSource.getRepository(AuthUser);
    const authUser = await authRepo.findOne({ where: { email } });
    expect(authUser).toBeTruthy();

    const otp = await redis.get(`otp:verify:${authUser?.id ?? ''}`);
    expect(otp).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/verification/confirm')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: otp })
      .expect(200);

    const verifiedUser = await authRepo.findOne({
      where: { id: authUser?.id },
    });
    expect(verifiedUser?.estadoVerificacion).toBe(
      EstadoVerificacionEnum.VERIFICADO,
    );
    expect(verifiedUser?.rol).toBe(RolUsuarioEnum.PASAJERO);
  });
});
