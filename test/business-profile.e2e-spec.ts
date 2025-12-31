import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { MailService } from '../src/modules/mail/mail.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { ResponseInterceptor } from '../src/modules/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../src/modules/common/filters/global-exception.filter';
import { AuditService } from '../src/modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import {
  FakeStorageService,
  InMemoryRedisService,
  NoopMailService,
} from './helpers/fakes';
import { truncateAllTables } from './helpers/db';
import { AuthUser } from '../src/modules/auth/Models/auth-user.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../src/modules/auth/Enum';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Business profile flows (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue(new InMemoryRedisService())
      .overrideProvider(MailService)
      .useValue(new NoopMailService())
      .overrideProvider(StorageService)
      .useValue(new FakeStorageService())
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

  it('reads, updates, and deletes the user profile', async () => {
    const suffix = Date.now().toString().slice(-6);
    const email = `bu${suffix}@epn.edu.ec`;
    const password = 'Segura.123';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password,
        nombre: 'Ana',
        apellido: 'Perez',
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

    const token = loginRes.body?.data?.token as string;
    expect(token).toBeDefined();

    const profileRes = await request(app.getHttpServer())
      .get('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(profileRes.body?.data?.email).toBe(email);

    await request(app.getHttpServer())
      .patch('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Lucia', apellido: 'Gomez', celular: '0999999999' })
      .expect(200);

    const updatedProfile = await request(app.getHttpServer())
      .get('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(updatedProfile.body?.data?.nombre).toBe('Lucia');
    expect(updatedProfile.body?.data?.apellido).toBe('Gomez');
    expect(updatedProfile.body?.data?.celular).toBe('0999999999');

    const fileBuffer = Buffer.from('test-image');

    await request(app.getHttpServer())
      .patch('/api/business/profile/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', fileBuffer, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(200);

    const displayName = await request(app.getHttpServer())
      .get('/api/business/profile/display-name')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(displayName.body?.data).toContain('Lucia');

    await request(app.getHttpServer())
      .delete('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
