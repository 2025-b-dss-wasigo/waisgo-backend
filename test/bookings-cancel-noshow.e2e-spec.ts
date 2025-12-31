import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { MailService } from '../src/modules/mail/mail.service';
import { ResponseInterceptor } from '../src/modules/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../src/modules/common/filters/global-exception.filter';
import { AuditService } from '../src/modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { InMemoryRedisService, NoopMailService } from './helpers/fakes';
import { truncateAllTables } from './helpers/db';
import { AuthUser } from '../src/modules/auth/Models/auth-user.entity';
import { BusinessUser } from '../src/modules/business/Models/business-user.entity';
import { Driver } from '../src/modules/drivers/Models/driver.entity';
import { Vehicle } from '../src/modules/drivers/Models/vehicle.entity';
import { Booking } from '../src/modules/bookings/Models/booking.entity';
import { Route } from '../src/modules/routes/Models/route.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../src/modules/auth/Enum';
import { EstadoConductorEnum } from '../src/modules/drivers/Enums/estado-conductor.enum';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum } from '../src/modules/payments/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Bookings cancel + no-show flows (e2e)', () => {
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

  it('cancels bookings, validates maps, and blocks debtors', async () => {
    const password = 'Segura.123';
    const suffix = Date.now().toString().slice(-6);
    const passengerEmail = `pc${suffix}@epn.edu.ec`;
    const driverEmail = `pd${suffix}@epn.edu.ec`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: passengerEmail,
        password,
        nombre: 'Passenger',
        apellido: 'User',
        celular: '0982222222',
      })
      .expect(201);

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

    const authRepo = dataSource.getRepository(AuthUser);
    await authRepo.update(
      { email: passengerEmail },
      {
        rol: RolUsuarioEnum.PASAJERO,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );
    await authRepo.update(
      { email: driverEmail },
      {
        rol: RolUsuarioEnum.CONDUCTOR,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

    const passengerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: passengerEmail, password })
      .expect(200);

    const passengerToken = passengerLogin.body?.data?.token as string;

    const driverLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: driverEmail, password })
      .expect(200);

    const driverToken = driverLogin.body?.data?.token as string;

    const businessRepo = dataSource.getRepository(BusinessUser);
    const driverBusiness = await businessRepo.findOne({
      where: { email: driverEmail },
    });

    const driverRepo = dataSource.getRepository(Driver);
    const vehicleRepo = dataSource.getRepository(Vehicle);

    const driver = driverRepo.create({
      publicId: await generatePublicId(driverRepo, 'DRV'),
      userId: driverBusiness?.id as string,
      paypalEmail: 'driver@epn.edu.ec',
      estado: EstadoConductorEnum.APROBADO,
      fechaAprobacion: new Date(),
    });
    await driverRepo.save(driver);

    const vehicle = vehicleRepo.create({
      publicId: await generatePublicId(vehicleRepo, 'VEH'),
      driverId: driver.id,
      marca: 'Toyota',
      modelo: 'Yaris',
      color: 'Azul',
      placa: `ABC${suffix.slice(-4)}`,
      asientosDisponibles: 4,
      isActivo: true,
    });
    await vehicleRepo.save(vehicle);

    const futureRoute = await request(app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2099-01-01',
        horaSalida: '08:30',
        destinoBase: 'Destino',
        asientosTotales: 2,
        precioPasajero: 2.5,
        stops: [{ lat: -0.18, lng: -78.48, direccion: 'Parada 1' }],
      })
      .expect(201);

    const futureRouteId = futureRoute.body?.data?.routeId as string;
    expect(futureRouteId).toBeDefined();

    await request(app.getHttpServer())
      .get('/api/routes/my')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const availableRes = await request(app.getHttpServer())
      .get('/api/routes/available')
      .set('Authorization', `Bearer ${passengerToken}`)
      .query({ lat: -0.18, lng: -78.48, fecha: '2099-01-01' })
      .expect(200);

    expect(availableRes.body?.data?.data?.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/api/routes/${futureRouteId}/stops`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: -0.181, lng: -78.49, direccion: 'Parada 2' })
      .expect(201);

    const routeMapRes = await request(app.getHttpServer())
      .get(`/api/routes/${futureRouteId}/map`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(routeMapRes.body?.data?.stops?.length).toBe(2);

    const bookingRes = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId: futureRouteId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(201);

    const bookingId = bookingRes.body?.data?.bookingId as string;
    expect(bookingId).toBeDefined();

    const bookingsByRoute = await request(app.getHttpServer())
      .get(`/api/bookings/route/${futureRouteId}`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    expect(bookingsByRoute.body?.data?.data?.length).toBe(1);

    const bookingMap = await request(app.getHttpServer())
      .get(`/api/bookings/${bookingId}/map`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(bookingMap.body?.data?.stops?.length).toBe(2);

    const myBookings = await request(app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(myBookings.body?.data?.data?.length).toBe(1);

    const bookingDetail = await request(app.getHttpServer())
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(bookingDetail.body?.data?.data?.publicId).toBe(bookingId);

    const routeDetail = await request(app.getHttpServer())
      .get(`/api/routes/${futureRouteId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(routeDetail.body?.data?.data?.publicId).toBe(futureRouteId);

    await request(app.getHttpServer())
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/bookings/${bookingId}/map`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(403);

    const bookingRepo = dataSource.getRepository(Booking);
    const routeRepo = dataSource.getRepository(Route);

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

    const pastRoute = await request(app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2000-01-01',
        horaSalida: '00:00',
        destinoBase: 'Destino',
        asientosTotales: 1,
        precioPasajero: 2.5,
        stops: [{ lat: -0.19, lng: -78.5, direccion: 'Parada X' }],
      })
      .expect(201);

    const pastRouteId = pastRoute.body?.data?.routeId as string;

    const pastBookingRes = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId: pastRouteId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(201);

    const pastBookingId = pastBookingRes.body?.data?.bookingId as string;

    await request(app.getHttpServer())
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

    const thirdRoute = await request(app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2099-01-02',
        horaSalida: '09:00',
        destinoBase: 'Destino',
        asientosTotales: 1,
        precioPasajero: 2.5,
        stops: [{ lat: -0.2, lng: -78.51, direccion: 'Parada Z' }],
      })
      .expect(201);

    const thirdRouteId = thirdRoute.body?.data?.routeId as string;

    await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId: thirdRouteId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(400);
  });
});
