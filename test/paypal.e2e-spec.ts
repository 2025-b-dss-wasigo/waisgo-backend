import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { CampusOrigenEnum } from '../src/modules/routes/Enums';
import { MetodoPagoEnum, EstadoPagoEnum } from '../src/modules/payments/Enums';
import { mockPaypalFetch, restoreFetch } from './helpers/paypal-mock';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  buildUserSeed,
  loginUser,
  registerAndVerifyUser,
  registerUser,
  setUserRole,
} from './helpers/auth';
import {
  createBooking,
  createDriver,
  createRoute,
  createVehicle,
  getBusinessUserFromAuth,
} from './helpers/fixtures';
import { Payment } from '../src/modules/payments/Models/payment.entity';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describePaypal = hasTestDb ? describe : describe.skip;

describePaypal('PayPal flow (e2e)', () => {
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

  it('creates PayPal order, captures, and refunds', async () => {
    const passengerSeed = buildUserSeed('pp', {
      nombre: 'Ana',
      apellido: 'Perez',
      celular: '0987654321',
    });
    const driverSeed = buildUserSeed('pd', {
      nombre: 'Luis',
      apellido: 'Gomez',
      celular: '0981234567',
    });
    const adminSeed = buildUserSeed('pa', {
      nombre: 'Admin',
      apellido: 'User',
      celular: '0980000000',
    });

    const { token: passengerToken } = await registerAndVerifyUser(
      ctx.app,
      ctx.dataSource,
      ctx.redis,
      passengerSeed,
    );

    const passengerBusiness = await getBusinessUserFromAuth(
      ctx.app,
      ctx.dataSource,
      passengerSeed.email,
    );

    await registerUser(ctx.app, driverSeed);
    await setUserRole(
      ctx.dataSource,
      driverSeed.email,
      RolUsuarioEnum.CONDUCTOR,
      true,
    );

    const driverBusiness = await getBusinessUserFromAuth(
      ctx.app,
      ctx.dataSource,
      driverSeed.email,
    );
    const driver = await createDriver(ctx.dataSource, {
      businessUserId: driverBusiness?.id as string,
      paypalEmail: 'driver@epn.edu.ec',
    });
    await createVehicle(ctx.dataSource, {
      driverId: driver.id,
      placa: `R${Date.now().toString().slice(-6)}`,
    });

    const route = await createRoute(ctx.dataSource, {
      driverId: driver.id,
      origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
      fecha: '2030-02-15',
      horaSalida: '10:00',
      asientosTotales: 2,
      asientosDisponibles: 2,
      precioPasajero: 3.5,
    });

    const booking = await createBooking(ctx.dataSource, {
      routeId: route.id,
      passengerId: passengerBusiness!.id,
      metodoPago: MetodoPagoEnum.PAYPAL,
    });

    const paymentRes = await request(ctx.app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ bookingId: booking.publicId, method: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const paymentId = paymentRes.body?.data?.paymentId as string;

    const orderRes = await request(ctx.app.getHttpServer())
      .post(`/api/payments/${paymentId}/paypal/create`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    const paypalOrderId = orderRes.body?.data?.paypalOrderId as string;
    expect(paypalOrderId).toBeDefined();

    await request(ctx.app.getHttpServer())
      .post(`/api/payments/${paymentId}/paypal/capture`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ paypalOrderId })
      .expect(200);

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

    await request(ctx.app.getHttpServer())
      .patch(`/api/payments/${paymentId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const paymentRepo = ctx.dataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
      where: { publicId: paymentId },
    });
    expect(payment?.status).toBe(EstadoPagoEnum.REVERSED);
  });
});
