import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { Route } from '../src/modules/routes/Models/route.entity';
import { Booking } from '../src/modules/bookings/Models/booking.entity';
import { Payment } from '../src/modules/payments/Models/payment.entity';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum, EstadoPagoEnum } from '../src/modules/payments/Enums';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  buildUserSeed,
  loginUser,
  registerUser,
  setUserRole,
} from './helpers/auth';
import {
  createDriver,
  createVehicle,
  getBusinessUserFromAuth,
} from './helpers/fixtures';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Routes cancel and finalize flows (e2e)', () => {
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

  it('cancels a route and marks bookings/payments as failed', async () => {
    const suffix = Date.now().toString().slice(-6);
    const driverSeed = buildUserSeed('rc', {
      nombre: 'Driver',
      apellido: 'User',
      celular: '0981111111',
    });
    const passengerSeed = buildUserSeed('rp', {
      nombre: 'Passenger',
      apellido: 'User',
      celular: '0982222222',
    });

    await registerUser(ctx.app, driverSeed);
    await registerUser(ctx.app, passengerSeed);

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
    const driver = await createDriver(ctx.dataSource, {
      businessUserId: driverBusiness?.id as string,
      paypalEmail: 'driver@epn.edu.ec',
    });

    await createVehicle(ctx.dataSource, {
      driverId: driver.id,
      placa: `ABC${suffix.slice(-4)}`,
    });

    const routeRes = await request(ctx.app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2030-04-01',
        horaSalida: '08:30',
        destinoBase: 'Destino',
        asientosTotales: 2,
        precioPasajero: 2.5,
        stops: [
          { lat: -0.18, lng: -78.48, direccion: 'Parada 1' },
          { lat: -0.19, lng: -78.49, direccion: 'Parada 2' },
        ],
      })
      .expect(201);

    const routeId = routeRes.body?.data?.routeId as string;

    const bookingRes = await request(ctx.app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId, metodoPago: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const bookingId = bookingRes.body?.data?.bookingId as string;

    const paymentRes = await request(ctx.app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ bookingId, method: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const paymentId = paymentRes.body?.data?.paymentId as string;

    await request(ctx.app.getHttpServer())
      .patch(`/api/routes/${routeId}/cancel`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const routeRepo = ctx.dataSource.getRepository(Route);
    const bookingRepo = ctx.dataSource.getRepository(Booking);
    const paymentRepo = ctx.dataSource.getRepository(Payment);

    const cancelledRoute = await routeRepo.findOne({
      where: { publicId: routeId },
    });
    expect(cancelledRoute?.estado).toBe(EstadoRutaEnum.CANCELADA);

    const cancelledBooking = await bookingRepo.findOne({
      where: { publicId: bookingId },
    });
    expect(cancelledBooking?.estado).toBe(EstadoReservaEnum.CANCELADA);

    const failedPayment = await paymentRepo.findOne({
      where: { publicId: paymentId },
    });
    expect(failedPayment?.status).toBe(EstadoPagoEnum.FAILED);
  });

  it('finalizes a route with no pending bookings', async () => {
    const suffix = Date.now().toString().slice(-6);
    const driverSeed = buildUserSeed('rf', {
      nombre: 'Driver',
      apellido: 'User',
      celular: '0981111111',
    });

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
      placa: `ABD${suffix.slice(-4)}`,
    });

    const routeRes = await request(ctx.app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2030-05-01',
        horaSalida: '09:00',
        destinoBase: 'Destino',
        asientosTotales: 2,
        precioPasajero: 2.5,
        stops: [
          { lat: -0.19, lng: -78.49, direccion: 'Parada 1' },
          { lat: -0.2, lng: -78.5, direccion: 'Parada 2' },
        ],
      })
      .expect(201);

    const routeId = routeRes.body?.data?.routeId as string;

    await request(ctx.app.getHttpServer())
      .patch(`/api/routes/${routeId}/finalize`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const routeRepo = ctx.dataSource.getRepository(Route);
    const finalizedRoute = await routeRepo.findOne({
      where: { publicId: routeId },
    });
    expect(finalizedRoute?.estado).toBe(EstadoRutaEnum.FINALIZADA);
  });
});
