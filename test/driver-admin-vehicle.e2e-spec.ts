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

describeFlow('Driver onboarding + vehicle lifecycle (e2e)', () => {
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

  it('applies as driver, uploads docs, admin approves, and manages vehicle', async () => {
    const password = 'Segura.123';
    const suffix = Date.now().toString().slice(-6);
    const adminEmail = `ad${suffix}@epn.edu.ec`;
    const driverEmail = `dr${suffix}@epn.edu.ec`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: adminEmail,
        password,
        nombre: 'Admin',
        apellido: 'User',
        celular: '0980000000',
      })
      .expect(201);

    const authRepo = dataSource.getRepository(AuthUser);
    await authRepo.update(
      { email: adminEmail },
      {
        rol: RolUsuarioEnum.ADMIN,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    const adminToken = adminLogin.body?.data?.token as string;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: driverEmail,
        password,
        nombre: 'Driver',
        apellido: 'User',
        celular: '0981111111',
      })
      .expect(201);

    await authRepo.update(
      { email: driverEmail },
      {
        rol: RolUsuarioEnum.PASAJERO,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

    const driverLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: driverEmail, password })
      .expect(200);

    const driverToken = driverLogin.body?.data?.token as string;

    const applyRes = await request(app.getHttpServer())
      .post('/api/drivers/apply')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ paypalEmail: 'driver@epn.edu.ec' })
      .expect(201);

    const driverId = applyRes.body?.data?.driverId as string;
    expect(driverId).toBeDefined();

    const statusRes = await request(app.getHttpServer())
      .get('/api/drivers/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(statusRes.body?.data?.hasApplication).toBe(true);

    const fileBuffer = Buffer.from('%PDF-1.4 test');

    const licenciaRes = await request(app.getHttpServer())
      .post('/api/drivers/documents/LICENCIA')
      .set('Authorization', `Bearer ${driverToken}`)
      .attach('file', fileBuffer, {
        filename: 'licencia.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);

    const licenciaId = licenciaRes.body?.data?.documentId as string;
    expect(licenciaId).toBeDefined();

    const matriculaRes = await request(app.getHttpServer())
      .post('/api/drivers/documents/MATRICULA')
      .set('Authorization', `Bearer ${driverToken}`)
      .attach('file', fileBuffer, {
        filename: 'matricula.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);

    const matriculaId = matriculaRes.body?.data?.documentId as string;
    expect(matriculaId).toBeDefined();

    const listRes = await request(app.getHttpServer())
      .get('/api/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ estado: 'PENDIENTE' })
      .expect(200);

    const pendingDrivers = listRes.body?.data?.drivers as Array<{
      publicId?: string;
    }>;
    expect(
      pendingDrivers?.some((driver) => driver.publicId === driverId),
    ).toBe(true);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/admin/drivers/${driverId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detailRes.body?.data?.driver?.publicId).toBe(driverId);
    expect(detailRes.body?.data?.documentsWithUrls?.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch(`/api/admin/drivers/documents/${licenciaId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/admin/drivers/documents/${matriculaId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/admin/drivers/${driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const driverLoginApproved = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: driverEmail, password })
      .expect(200);

    const driverApprovedToken = driverLoginApproved.body?.data?.token as string;

    const vehicleRes = await request(app.getHttpServer())
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .send({
        marca: 'Toyota',
        modelo: 'Yaris',
        color: 'Azul',
        placa: `ABC${suffix.slice(-4)}`,
        asientosDisponibles: 4,
      })
      .expect(201);

    const vehicleId = vehicleRes.body?.data?.vehicle?.publicId as string;
    expect(vehicleId).toBeDefined();

    const vehiclesRes = await request(app.getHttpServer())
      .get('/api/vehicles/me')
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .expect(200);

    expect(vehiclesRes.body?.data?.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch(`/api/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .send({ color: 'Negro' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/vehicles/${vehicleId}/disable`)
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/vehicles/${vehicleId}/reactivate`)
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/admin/drivers/${driverId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
