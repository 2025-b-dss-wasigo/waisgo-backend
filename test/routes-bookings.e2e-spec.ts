import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { Route } from '../src/modules/routes/Models/route.entity';
import { Booking } from '../src/modules/bookings/Models/booking.entity';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum } from '../src/modules/payments/Enums';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  buildUserSeed,
  loginUser,
  registerAndVerifyUser,
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

describeFlow('Routes + Bookings + OTP + Ratings (e2e)', () => {
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

  it('creates route, books, verifies OTP, completes, and rates', async () => {
    const passengerSeed = buildUserSeed('ps', {
      nombre: 'Carlos',
      apellido: 'Perez',
      celular: '0987654321',
    });
    const driverSeed = buildUserSeed('dr', {
      nombre: 'Andrea',
      apellido: 'Lopez',
      celular: '0981234567',
    });

    const { token: passengerToken } = await registerAndVerifyUser(
      ctx.app,
      ctx.dataSource,
      ctx.redis,
      passengerSeed,
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
      placa: `P${Date.now().toString().slice(-6)}`,
    });

    const routeRes = await request(ctx.app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2030-01-15',
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
    expect(routeId).toBeDefined();

    const bookingRes = await request(ctx.app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(201);

    const bookingId = bookingRes.body?.data?.bookingId as string;
    const otpValue = bookingRes.body?.data?.otp as string;
    expect(bookingId).toBeDefined();
    expect(otpValue).toBeDefined();

    await request(ctx.app.getHttpServer())
      .post(`/api/bookings/${bookingId}/verify-otp`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ otp: otpValue })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .patch(`/api/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const bookingRepo = ctx.dataSource.getRepository(Booking);
    const routeRepo = ctx.dataSource.getRepository(Route);

    const booking = await bookingRepo.findOne({
      where: { publicId: bookingId },
    });
    expect(booking?.estado).toBe(EstadoReservaEnum.COMPLETADA);

    const route = await routeRepo.findOne({ where: { publicId: routeId } });
    expect(route?.estado).toBe(EstadoRutaEnum.FINALIZADA);

    const ratingRes = await request(ctx.app.getHttpServer())
      .post('/api/ratings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({
        routeId,
        toUserId: driverBusiness?.alias,
        score: 5,
        comment: 'Buen viaje',
      })
      .expect(201);

    expect(ratingRes.body?.data?.ratingId).toBeDefined();

    const ratingsReceived = await request(ctx.app.getHttpServer())
      .get('/api/ratings/my')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(ratingsReceived.body?.data?.total).toBe(1);

    const ratingsGiven = await request(ctx.app.getHttpServer())
      .get('/api/ratings/given')
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(ratingsGiven.body?.data?.total).toBe(1);

    const summaryRes = await request(ctx.app.getHttpServer())
      .get('/api/ratings/summary')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(summaryRes.body?.data?.average).toBeGreaterThan(0);

    const canRateRes = await request(ctx.app.getHttpServer())
      .get(`/api/ratings/can-rate/${routeId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(canRateRes.body?.data?.canRate).toBe(false);
  });
});
