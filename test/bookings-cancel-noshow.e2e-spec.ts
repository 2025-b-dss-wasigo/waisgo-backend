import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { Booking } from '../src/modules/bookings/Models/booking.entity';
import { Route } from '../src/modules/routes/Models/route.entity';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum } from '../src/modules/payments/Enums';
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

describeFlow('Bookings cancel + no-show flows (e2e)', () => {
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

  it('cancels bookings, validates maps, and blocks debtors', async () => {
    const suffix = Date.now().toString().slice(-6);
    const passengerSeed = buildUserSeed('pc', {
      nombre: 'Passenger',
      apellido: 'User',
      celular: '0982222222',
    });
    const driverSeed = buildUserSeed('pd', {
      nombre: 'Driver',
      apellido: 'User',
      celular: '0981111111',
    });

    await registerUser(ctx.app, passengerSeed);
    await registerUser(ctx.app, driverSeed);

    await setUserRole(
      ctx.dataSource,
      passengerSeed.email,
      RolUsuarioEnum.PASAJERO,
      true,
    );
    await setUserRole(
      ctx.dataSource,
      driverSeed.email,
      RolUsuarioEnum.CONDUCTOR,
      true,
    );

    const passengerToken = await loginUser(
      ctx.app,
      passengerSeed.email,
      passengerSeed.password,
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
      placa: `ABC${suffix.slice(-4)}`,
    });

    const futureRoute = await request(ctx.app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2099-01-01',
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

    const futureRouteId = futureRoute.body?.data?.routeId as string;
    expect(futureRouteId).toBeDefined();

    await request(ctx.app.getHttpServer())
      .get('/api/routes/my')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const availableRes = await request(ctx.app.getHttpServer())
      .get('/api/routes/available')
      .set('Authorization', `Bearer ${passengerToken}`)
      .query({ lat: -0.18, lng: -78.48, fecha: '2099-01-01' })
      .expect(200);

    expect(availableRes.body?.data?.data?.length).toBeGreaterThan(0);

    await request(ctx.app.getHttpServer())
      .post(`/api/routes/${futureRouteId}/stops`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: -0.181, lng: -78.49, direccion: 'Parada 2' })
      .expect(201);

    const routeMapRes = await request(ctx.app.getHttpServer())
      .get(`/api/routes/${futureRouteId}/map`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(routeMapRes.body?.data?.stops?.length).toBe(3);

    const bookingRes = await request(ctx.app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId: futureRouteId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(201);

    const bookingId = bookingRes.body?.data?.bookingId as string;
    expect(bookingId).toBeDefined();

    const bookingsByRoute = await request(ctx.app.getHttpServer())
      .get(`/api/bookings/route/${futureRouteId}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(bookingsByRoute.body?.data?.data?.length).toBe(1);

    const bookingMap = await request(ctx.app.getHttpServer())
      .get(`/api/bookings/${bookingId}/map`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(bookingMap.body?.data?.stops?.length).toBe(3);

    const myBookings = await request(ctx.app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(myBookings.body?.data?.data?.length).toBe(1);

    const bookingDetail = await request(ctx.app.getHttpServer())
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(bookingDetail.body?.data?.data?.publicId).toBe(bookingId);

    const routeDetail = await request(ctx.app.getHttpServer())
      .get(`/api/routes/${futureRouteId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(routeDetail.body?.data?.data?.publicId).toBe(futureRouteId);

    await request(ctx.app.getHttpServer())
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get(`/api/bookings/${bookingId}/map`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(403);

    const bookingRepo = ctx.dataSource.getRepository(Booking);
    const routeRepo = ctx.dataSource.getRepository(Route);

    const cancelledBooking = await bookingRepo.findOne({
      where: { publicId: bookingId },
    });
    expect(cancelledBooking?.estado).toBe(EstadoReservaEnum.CANCELADA);

    const refreshedRoute = await routeRepo.findOne({
      where: { publicId: futureRouteId },
    });
    expect(refreshedRoute?.asientosDisponibles).toBe(
      refreshedRoute?.asientosTotales,
    );

    const pastRoute = await request(ctx.app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2099-01-03',
        horaSalida: '08:30',
        destinoBase: 'Destino',
        asientosTotales: 1,
        precioPasajero: 2.5,
        stops: [
          { lat: -0.19, lng: -78.5, direccion: 'Parada X' },
          { lat: -0.2, lng: -78.51, direccion: 'Parada Y' },
        ],
      })
      .expect(201);

    const pastRouteId = pastRoute.body?.data?.routeId as string;

    const pastBookingRes = await request(ctx.app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId: pastRouteId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(201);

    const pastBookingId = pastBookingRes.body?.data?.bookingId as string;

    await routeRepo.update(
      { publicId: pastRouteId },
      { fecha: '2000-01-01', horaSalida: '00:00' },
    );

    await request(ctx.app.getHttpServer())
      .patch(`/api/bookings/${pastBookingId}/no-show`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const noShowBooking = await bookingRepo.findOne({
      where: { publicId: pastBookingId },
    });
    expect(noShowBooking?.estado).toBe(EstadoReservaEnum.NO_SHOW);

    const finalizedRoute = await routeRepo.findOne({
      where: { publicId: pastRouteId },
    });
    expect(finalizedRoute?.estado).toBe(EstadoRutaEnum.FINALIZADA);

    const thirdRoute = await request(ctx.app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2099-01-02',
        horaSalida: '09:00',
        destinoBase: 'Destino',
        asientosTotales: 1,
        precioPasajero: 2.5,
        stops: [
          { lat: -0.2, lng: -78.51, direccion: 'Parada Z' },
          { lat: -0.21, lng: -78.52, direccion: 'Parada W' },
        ],
      })
      .expect(201);

    const thirdRouteId = thirdRoute.body?.data?.routeId as string;

    await request(ctx.app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId: thirdRouteId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(400);
  });
});
