import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { Payout } from '../src/modules/payments/Models/payout.entity';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import {
  MetodoPagoEnum,
  EstadoPagoEnum,
  EstadoPayoutEnum,
} from '../src/modules/payments/Enums';
import { mockPaypalFetch, restoreFetch } from './helpers/paypal-mock';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  buildUserSeed,
  loginUser,
  registerUser,
  setUserRole,
} from './helpers/auth';
import {
  createBooking,
  createDriver,
  createPayment,
  createRoute,
  getBusinessUserFromAuth,
} from './helpers/fixtures';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describePayouts = hasTestDb ? describe : describe.skip;

describePayouts('Payouts flow (e2e)', () => {
  let ctx: TestAppContext;
  let originalFetch: typeof fetch | undefined;

  beforeAll(async () => {
    originalFetch = global.fetch;
    mockPaypalFetch();

    ctx = await createTestApp();
  });

  afterAll(async () => {
    restoreFetch(originalFetch);
    await ctx.app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(ctx.dataSource);
    ctx.redis.clear();
  });

  it('generates, executes, and fails a payout', async () => {
    const adminSeed = buildUserSeed('pa', {
      nombre: 'Admin',
      apellido: 'User',
      celular: '0980000000',
    });
    const driverSeed = buildUserSeed('pd', {
      nombre: 'Driver',
      apellido: 'User',
      celular: '0981111111',
    });
    const passengerSeed = buildUserSeed('pp', {
      nombre: 'Passenger',
      apellido: 'User',
      celular: '0982222222',
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
      RolUsuarioEnum.CONDUCTOR,
      true,
    );
    const driverToken = await loginUser(
      ctx.app,
      driverSeed.email,
      driverSeed.password,
    );

    await registerUser(ctx.app, passengerSeed);

    const driverBusiness = await getBusinessUserFromAuth(
      ctx.app,
      ctx.dataSource,
      driverSeed.email,
    );
    const passengerBusiness = await getBusinessUserFromAuth(
      ctx.app,
      ctx.dataSource,
      passengerSeed.email,
    );

    const driver = await createDriver(ctx.dataSource, {
      businessUserId: driverBusiness?.id as string,
      paypalEmail: 'driver@epn.edu.ec',
    });

    const route = await createRoute(ctx.dataSource, {
      driverId: driver.id,
      fecha: '2025-01-10',
      horaSalida: '08:00',
      asientosTotales: 3,
      asientosDisponibles: 2,
      precioPasajero: 2.5,
    });

    const booking = await createBooking(ctx.dataSource, {
      routeId: route.id,
      passengerId: passengerBusiness?.id as string,
      estado: EstadoReservaEnum.COMPLETADA,
      otpUsado: true,
      metodoPago: MetodoPagoEnum.PAYPAL,
    });

    await createPayment(ctx.dataSource, {
      bookingId: booking.id,
      amount: 6,
      method: MetodoPagoEnum.PAYPAL,
      status: EstadoPagoEnum.PAID,
      paidAt: new Date('2025-01-10T12:00:00Z'),
    });

    await request(ctx.app.getHttpServer())
      .post('/api/payouts/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ period: '2025-01' })
      .expect(201);

    const payoutRepo = ctx.dataSource.getRepository(Payout);
    const payout = await payoutRepo.findOne({
      where: { driverId: driver.id },
    });
    expect(payout).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post(`/api/payouts/${payout?.publicId}/paypal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const paidPayout = await payoutRepo.findOne({
      where: { id: payout?.id },
    });
    expect(paidPayout?.status).toBe(EstadoPayoutEnum.PAID);

    await request(ctx.app.getHttpServer())
      .patch(`/api/payouts/${payout?.publicId}/fail`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Manual fail' })
      .expect(200);

    const failedPayout = await payoutRepo.findOne({
      where: { id: payout?.id },
    });
    expect(failedPayout?.status).toBe(EstadoPayoutEnum.FAILED);

    const driverPayouts = await request(ctx.app.getHttpServer())
      .get('/api/payouts/my')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(driverPayouts.body?.data?.data?.length).toBe(1);

    const driverPayoutDetail = await request(ctx.app.getHttpServer())
      .get(`/api/payouts/${payout?.publicId}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(driverPayoutDetail.body?.data?.data?.publicId).toBe(
      payout?.publicId,
    );

    const adminList = await request(ctx.app.getHttpServer())
      .get('/api/payouts')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: EstadoPayoutEnum.FAILED })
      .expect(200);

    expect(adminList.body?.data?.total).toBe(1);
  });
});
