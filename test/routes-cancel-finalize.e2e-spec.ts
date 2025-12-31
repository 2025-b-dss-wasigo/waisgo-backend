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
import { Route } from '../src/modules/routes/Models/route.entity';
import { Booking } from '../src/modules/bookings/Models/booking.entity';
import { Payment } from '../src/modules/payments/Models/payment.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../src/modules/auth/Enum';
import { EstadoConductorEnum } from '../src/modules/drivers/Enums/estado-conductor.enum';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum, EstadoPagoEnum } from '../src/modules/payments/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Routes cancel and finalize flows (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RedisService)
      .useValue(new InMemoryRedisService())
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

  it('cancels a route and marks bookings/payments as failed', async () => {
    const suffix = Date.now().toString().slice(-6);
    const password = 'Segura.123';
    const driverEmail = `rc${suffix}@epn.edu.ec`;
    const passengerEmail = `rp${suffix}@epn.edu.ec`;

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

    const authRepo = dataSource.getRepository(AuthUser);
    await authRepo.update(
      { email: driverEmail },
      {
        rol: RolUsuarioEnum.CONDUCTOR,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );
    await authRepo.update(
      { email: passengerEmail },
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

    const passengerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: passengerEmail, password })
      .expect(200);

    const passengerToken = passengerLogin.body?.data?.token as string;

    const businessRepo = dataSource.getRepository(BusinessUser);
    const driverBusiness = await businessRepo.findOne({
      where: { email: driverEmail },
    });
    const passengerBusiness = await businessRepo.findOne({
      where: { email: passengerEmail },
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

    const routeRes = await request(app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2030-04-01',
        horaSalida: '08:30',
        destinoBase: 'Destino',
        asientosTotales: 2,
        precioPasajero: 2.5,
        stops: [{ lat: -0.18, lng: -78.48, direccion: 'Parada 1' }],
      })
      .expect(201);

    const routeId = routeRes.body?.data?.routeId as string;

    const bookingRes = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId, metodoPago: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const bookingId = bookingRes.body?.data?.bookingId as string;

    const paymentRes = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ bookingId, method: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const paymentId = paymentRes.body?.data?.paymentId as string;

    await request(app.getHttpServer())
      .patch(`/api/routes/${routeId}/cancel`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const routeRepo = dataSource.getRepository(Route);
    const bookingRepo = dataSource.getRepository(Booking);
    const paymentRepo = dataSource.getRepository(Payment);

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
    const password = 'Segura.123';
    const driverEmail = `rf${suffix}@epn.edu.ec`;

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
      { email: driverEmail },
      {
        rol: RolUsuarioEnum.CONDUCTOR,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

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
      placa: `ABD${suffix.slice(-4)}`,
      asientosDisponibles: 4,
      isActivo: true,
    });
    await vehicleRepo.save(vehicle);

    const routeRes = await request(app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2030-05-01',
        horaSalida: '09:00',
        destinoBase: 'Destino',
        asientosTotales: 2,
        precioPasajero: 2.5,
        stops: [{ lat: -0.19, lng: -78.49, direccion: 'Parada 1' }],
      })
      .expect(201);

    const routeId = routeRes.body?.data?.routeId as string;

    await request(app.getHttpServer())
      .patch(`/api/routes/${routeId}/finalize`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const routeRepo = dataSource.getRepository(Route);
    const finalizedRoute = await routeRepo.findOne({
      where: { publicId: routeId },
    });
    expect(finalizedRoute?.estado).toBe(EstadoRutaEnum.FINALIZADA);
  });
});
