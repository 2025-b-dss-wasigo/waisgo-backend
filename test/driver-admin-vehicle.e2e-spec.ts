import request from 'supertest';
import { StorageService } from '../src/modules/storage/storage.service';
import { FakeStorageService } from './helpers/fakes';
import { truncateAllTables } from './helpers/db';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  buildUserSeed,
  loginUser,
  registerUser,
  setUserRole,
} from './helpers/auth';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Driver onboarding + vehicle lifecycle (e2e)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp({
      overrides: [
        {
          provide: StorageService,
          useValue: new FakeStorageService(),
        },
      ],
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(ctx.dataSource);
    ctx.redis.clear();
  });

  it('applies as driver, uploads docs, admin approves, and manages vehicle', async () => {
    const suffix = Date.now().toString().slice(-6);
    const adminSeed = buildUserSeed('ad', {
      nombre: 'Admin',
      apellido: 'User',
      celular: '0980000000',
    });
    const driverSeed = buildUserSeed('dr', {
      nombre: 'Driver',
      apellido: 'User',
      celular: '0981111111',
    });

    await registerUser(ctx.app, adminSeed);
    await setUserRole(
      ctx.dataSource,
      adminSeed.email,
      RolUsuarioEnum.ADMIN,
      true,
    );
    const adminToken = await loginUser(
      ctx.app,
      adminSeed.email,
      adminSeed.password,
    );

    await registerUser(ctx.app, driverSeed);
    await setUserRole(
      ctx.dataSource,
      driverSeed.email,
      RolUsuarioEnum.PASAJERO,
      true,
    );
    const driverToken = await loginUser(
      ctx.app,
      driverSeed.email,
      driverSeed.password,
    );

    const applyRes = await request(ctx.app.getHttpServer())
      .post('/api/drivers/apply')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ paypalEmail: 'driver@epn.edu.ec' })
      .expect(201);

    const driverId = applyRes.body?.data?.driverId as string;
    expect(driverId).toBeDefined();

    const statusRes = await request(ctx.app.getHttpServer())
      .get('/api/drivers/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(statusRes.body?.data?.hasApplication).toBe(true);

    const fileBuffer = Buffer.from('%PDF-1.4 test');

    const licenciaRes = await request(ctx.app.getHttpServer())
      .post('/api/drivers/documents/LICENCIA')
      .set('Authorization', `Bearer ${driverToken}`)
      .attach('file', fileBuffer, {
        filename: 'licencia.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);

    const licenciaId = licenciaRes.body?.data?.documentId as string;
    expect(licenciaId).toBeDefined();

    const matriculaRes = await request(ctx.app.getHttpServer())
      .post('/api/drivers/documents/MATRICULA')
      .set('Authorization', `Bearer ${driverToken}`)
      .attach('file', fileBuffer, {
        filename: 'matricula.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);

    const matriculaId = matriculaRes.body?.data?.documentId as string;
    expect(matriculaId).toBeDefined();

    const listRes = await request(ctx.app.getHttpServer())
      .get('/api/admin/drivers')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ estado: 'PENDIENTE' })
      .expect(200);

    const pendingDrivers = listRes.body?.data?.drivers as Array<{
      publicId?: string;
    }>;
    expect(pendingDrivers?.some((driver) => driver.publicId === driverId)).toBe(
      true,
    );

    const detailRes = await request(ctx.app.getHttpServer())
      .get(`/api/admin/drivers/${driverId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detailRes.body?.data?.driver?.publicId).toBe(driverId);
    expect(detailRes.body?.data?.documentsWithUrls?.length).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer())
      .patch(`/api/admin/drivers/documents/${licenciaId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/admin/drivers/documents/${matriculaId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/admin/drivers/${driverId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const driverLoginApproved = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: driverSeed.email, password: driverSeed.password })
      .expect(200);

    const driverApprovedToken = driverLoginApproved.body?.data
      ?.accessToken as string;

    const vehicleRes = await request(ctx.app.getHttpServer())
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

    const vehiclesRes = await request(ctx.app.getHttpServer())
      .get('/api/vehicles/me')
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .expect(200);

    expect(vehiclesRes.body?.data?.length).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer())
      .patch(`/api/vehicles/${vehicleId}`)
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .send({ color: 'Negro' })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/vehicles/${vehicleId}/disable`)
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/vehicles/${vehicleId}/reactivate`)
      .set('Authorization', `Bearer ${driverApprovedToken}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/admin/drivers/${driverId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });
});
