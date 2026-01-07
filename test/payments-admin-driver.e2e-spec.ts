import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum, EstadoPagoEnum } from '../src/modules/payments/Enums';
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
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Payments list + reverse flows (e2e)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(ctx.dataSource);
    ctx.redis.clear();
  });

  it('lists payments for passenger/driver/admin and reverses a payment', async () => {
    const adminSeed = buildUserSeed('am', {
      nombre: 'Admin',
      apellido: 'User',
      celular: '0980000000',
    });
    const driverSeed = buildUserSeed('dm', {
      nombre: 'Driver',
      apellido: 'User',
      celular: '0981111111',
    });
    const passengerSeed = buildUserSeed('pm', {
      nombre: 'Passenger',
      apellido: 'User',
      celular: '0982222222',
    });

    await registerUser(ctx.app, adminSeed);
    await registerUser(ctx.app, driverSeed);
    await registerUser(ctx.app, passengerSeed);

    await setUserRole(
      ctx.dataSource,
      adminSeed.email,
      RolUsuarioEnum.ADMIN,
      true,
    );
    await setUserRole(
      ctx.dataSource,
      driverSeed.email,
      RolUsuarioEnum.CONDUCTOR,
      true,
    );
    await setUserRole(
      ctx.dataSource,
      passengerSeed.email,
      RolUsuarioEnum.PASAJERO,
      true,
    );

    const adminToken = await loginUser(
      ctx.app,
      adminSeed.email,
      adminSeed.password,
    );
    const driverToken = await loginUser(
      ctx.app,
      driverSeed.email,
      driverSeed.password,
    );
    const passengerToken = await loginUser(
      ctx.app,
      passengerSeed.email,
      passengerSeed.password,
    );

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
      fecha: '2030-02-01',
      horaSalida: '08:00',
      asientosTotales: 2,
      asientosDisponibles: 1,
      precioPasajero: 3,
    });

    const booking = await createBooking(ctx.dataSource, {
      routeId: route.id,
      passengerId: passengerBusiness?.id as string,
      estado: EstadoReservaEnum.COMPLETADA,
      otpUsado: true,
      metodoPago: MetodoPagoEnum.EFECTIVO,
    });

    const payment = await createPayment(ctx.dataSource, {
      bookingId: booking.id,
      amount: 3,
      method: MetodoPagoEnum.EFECTIVO,
      status: EstadoPagoEnum.PAID,
      paidAt: new Date(),
    });

    const passengerPayments = await request(ctx.app.getHttpServer())
      .get('/api/payments/my')
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(passengerPayments.body?.data?.data?.length).toBe(1);

    const passengerPaymentDetail = await request(ctx.app.getHttpServer())
      .get(`/api/payments/${payment.publicId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(passengerPaymentDetail.body?.data?.data?.publicId).toBe(
      payment.publicId,
    );

    const driverPayments = await request(ctx.app.getHttpServer())
      .get('/api/payments/driver')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(driverPayments.body?.data?.data?.length).toBe(1);

    const adminPayments = await request(ctx.app.getHttpServer())
      .get('/api/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminPayments.body?.data?.total).toBe(1);

    await request(ctx.app.getHttpServer())
      .patch(`/api/payments/${payment.publicId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const reversedPayment = await request(ctx.app.getHttpServer())
      .get(`/api/payments/${payment.publicId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(reversedPayment.body?.data?.data?.status).toBe(
      EstadoPagoEnum.REVERSED,
    );
  });
});
