import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { Payment } from '../src/modules/payments/Models/payment.entity';
import { MetodoPagoEnum } from '../src/modules/payments/Enums';
import { createTestApp, TestAppContext } from './helpers/app';
import { buildUserSeed, registerAndVerifyUser } from './helpers/auth';
import {
  createBooking,
  createBusinessUser,
  createDriver,
  createRoute,
  getBusinessUserFromAuth,
} from './helpers/fixtures';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describePayments = hasTestDb ? describe : describe.skip;

describePayments('Payments idempotency (e2e)', () => {
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

  it('returns the same payment for repeated idempotent requests', async () => {
    const suffix = Date.now().toString().slice(-6);
    const seed = buildUserSeed('py', {
      nombre: 'Juan',
      apellido: 'Perez',
      celular: '0987654321',
    });

    const { token } = await registerAndVerifyUser(
      ctx.app,
      ctx.dataSource,
      ctx.redis,
      seed,
    );

    // Resolver businessUser desde authUser
    const passengerBusiness = await getBusinessUserFromAuth(
      ctx.app,
      ctx.dataSource,
      seed.email,
    );

    const paymentRepo = ctx.dataSource.getRepository(Payment);

    const driverUser = await createBusinessUser(ctx.dataSource, {
      alias: `driver${suffix}`.slice(0, 20),
    });

    const driver = await createDriver(ctx.dataSource, {
      businessUserId: driverUser.id,
      paypalEmail: 'driver@epn.edu.ec',
    });

    const route = await createRoute(ctx.dataSource, {
      driverId: driver.id,
      fecha: '2030-01-01',
      asientosTotales: 3,
      asientosDisponibles: 3,
      precioPasajero: 2.5,
    });

    const booking = await createBooking(ctx.dataSource, {
      routeId: route.id,
      passengerId: passengerBusiness!.id,
      metodoPago: MetodoPagoEnum.PAYPAL,
    });

    const idempotencyKey = 'PAYIDEMP1';

    const first = await request(ctx.app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ bookingId: booking.publicId, method: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const second = await request(ctx.app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ bookingId: booking.publicId, method: MetodoPagoEnum.PAYPAL })
      .expect(201);

    expect(first.body?.data?.paymentId).toBeDefined();
    expect(second.body?.data?.paymentId).toBe(first.body?.data?.paymentId);

    const payments = await paymentRepo.find();
    expect(payments).toHaveLength(1);
  });
});
