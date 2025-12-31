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
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../src/modules/auth/Enum';
import { EstadoConductorEnum } from '../src/modules/drivers/Enums/estado-conductor.enum';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum } from '../src/modules/payments/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Routes + Bookings + OTP + Ratings (e2e)', () => {
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

  it('creates route, books, verifies OTP, completes, and rates', async () => {
    const password = 'Segura.123';
    const suffix = Date.now().toString().slice(-6);
    const passengerEmail = `ps${suffix}@epn.edu.ec`;
    const driverEmail = `dr${suffix}@epn.edu.ec`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: passengerEmail,
        password,
        nombre: 'Carlos',
        apellido: 'Perez',
        celular: '0987654321',
      })
      .expect(201);

    const passengerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: passengerEmail, password })
      .expect(200);

    const passengerUserToken = passengerLogin.body?.data?.token as string;

    await request(app.getHttpServer())
      .post('/api/verification/send')
      .set('Authorization', `Bearer ${passengerUserToken}`)
      .expect(200);

    const authRepo = dataSource.getRepository(AuthUser);
    const passengerAuth = await authRepo.findOne({
      where: { email: passengerEmail },
    });
    const otp = await redis.get(`otp:verify:${passengerAuth?.id ?? ''}`);

    await request(app.getHttpServer())
      .post('/api/verification/confirm')
      .set('Authorization', `Bearer ${passengerUserToken}`)
      .send({ code: otp })
      .expect(200);

    const passengerLoginVerified = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: passengerEmail, password })
      .expect(200);

    const passengerToken = passengerLoginVerified.body?.data?.token as string;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: driverEmail,
        password,
        nombre: 'Andrea',
        apellido: 'Lopez',
        celular: '0981234567',
      })
      .expect(201);

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
      placa: `P${Date.now().toString().slice(-6)}`,
      asientosDisponibles: 4,
      isActivo: true,
    });
    await vehicleRepo.save(vehicle);

    const routeRes = await request(app.getHttpServer())
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
        ],
      })
      .expect(201);

    const routeId = routeRes.body?.data?.routeId as string;
    expect(routeId).toBeDefined();

    const bookingRes = await request(app.getHttpServer())
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ routeId, metodoPago: MetodoPagoEnum.EFECTIVO })
      .expect(201);

    const bookingId = bookingRes.body?.data?.bookingId as string;
    const otpValue = bookingRes.body?.data?.otp as string;
    expect(bookingId).toBeDefined();
    expect(otpValue).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/bookings/${bookingId}/verify-otp`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ otp: otpValue })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);

    const bookingRepo = dataSource.getRepository(Booking);
    const routeRepo = dataSource.getRepository(Route);

    const booking = await bookingRepo.findOne({
      where: { publicId: bookingId },
    });
    expect(booking?.estado).toBe(EstadoReservaEnum.COMPLETADA);

    const route = await routeRepo.findOne({ where: { publicId: routeId } });
    expect(route?.estado).toBe(EstadoRutaEnum.FINALIZADA);

    const ratingRes = await request(app.getHttpServer())
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
  });
});
