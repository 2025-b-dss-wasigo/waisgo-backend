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
import { CampusOrigenEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum, EstadoPagoEnum } from '../src/modules/payments/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';
import { mockPaypalFetch, restoreFetch } from './helpers/paypal-mock';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describePaypal = hasTestDb ? describe : describe.skip;

describePaypal('PayPal flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redis: InMemoryRedisService;
  let originalFetch: typeof fetch | undefined;

  beforeAll(async () => {
    originalFetch = global.fetch;
    mockPaypalFetch();

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
    restoreFetch(originalFetch);
    await app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(dataSource);
  });

  it('creates PayPal order, captures, and refunds', async () => {
    const password = 'Segura.123';
    const suffix = Date.now().toString().slice(-6);
    const passengerEmail = `pp${suffix}@epn.edu.ec`;
    const driverEmail = `pd${suffix}@epn.edu.ec`;
    const adminEmail = `pa${suffix}@epn.edu.ec`;

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: passengerEmail,
        password,
        nombre: 'Ana',
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
        nombre: 'Luis',
        apellido: 'Gomez',
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
      marca: 'Kia',
      modelo: 'Rio',
      color: 'Rojo',
      placa: `R${Date.now().toString().slice(-6)}`,
      asientosDisponibles: 4,
      isActivo: true,
    });
    await vehicleRepo.save(vehicle);

    const routeRes = await request(app.getHttpServer())
      .post('/api/routes')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({
        origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
        fecha: '2030-02-15',
        horaSalida: '10:00',
        destinoBase: 'Destino',
        asientosTotales: 2,
        precioPasajero: 3.5,
        stops: [
          { lat: -0.18, lng: -78.48, direccion: 'Parada 1' },
        ],
      })
      .expect(201);

    const routeId = routeRes.body?.data?.routeId as string;

    const bookingRepo = dataSource.getRepository(Booking);
    const booking = bookingRepo.create({
      publicId: await generatePublicId(bookingRepo, 'BKG'),
      routeId: (await dataSource.getRepository(Route).findOne({
        where: { publicId: routeId },
      }))?.id as string,
      passengerId: passengerAuth?.id as string,
      estado: EstadoReservaEnum.CONFIRMADA,
      otp: '123456',
      otpUsado: false,
      metodoPago: MetodoPagoEnum.PAYPAL,
    });
    await bookingRepo.save(booking);

    const paymentRes = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ bookingId: booking.publicId, method: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const paymentId = paymentRes.body?.data?.paymentId as string;

    const orderRes = await request(app.getHttpServer())
      .post(`/api/payments/${paymentId}/paypal/create`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    const paypalOrderId = orderRes.body?.data?.paypalOrderId as string;
    expect(paypalOrderId).toBeDefined();

    await request(app.getHttpServer())
      .post(`/api/payments/${paymentId}/paypal/capture`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({ paypalOrderId })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: adminEmail,
        password,
        nombre: 'Admin',
        apellido: 'User',
        celular: '0980000000',
      })
      .expect(201);

    await authRepo.update(
      { email: adminEmail },
      {
        rol: RolUsuarioEnum.ADMIN,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    const adminToken = adminLogin.body?.data?.token as string;

    await request(app.getHttpServer())
      .patch(`/api/payments/${paymentId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const paymentRepo = dataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({ where: { publicId: paymentId } });
    expect(payment?.status).toBe(EstadoPagoEnum.REVERSED);
  });
});
