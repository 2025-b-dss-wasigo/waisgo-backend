import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { EncryptJWT } from 'jose';
import { randomUUID } from 'node:crypto';
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

describeFlow('Payments list + reverse flows (e2e)', () => {
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
    redis.clear();
  });

  it('lists payments for passenger/driver/admin and reverses a payment', async () => {
    const suffix = Date.now().toString().slice(-6);
    const password = 'Segura.123';
    const adminEmail = `am${suffix}@epn.edu.ec`;
    const driverEmail = `dm${suffix}@epn.edu.ec`;
    const passengerEmail = `pm${suffix}@epn.edu.ec`;

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
      { email: adminEmail },
      {
        rol: RolUsuarioEnum.ADMIN,
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
    await authRepo.update(
      { email: passengerEmail },
      {
        rol: RolUsuarioEnum.PASAJERO,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

    const driverAuth = await authRepo.findOne({
      where: { email: driverEmail },
    });

    if (driverAuth) {
      driverAuth.rol = RolUsuarioEnum.CONDUCTOR;
      driverAuth.estadoVerificacion = EstadoVerificacionEnum.VERIFICADO;
      await authRepo.save(driverAuth);
    }

    await dataSource.query(
      'UPDATE auth.auth_users SET "rol" = $1, "estadoVerificacion" = $2 WHERE "email" = $3',
      [RolUsuarioEnum.CONDUCTOR, EstadoVerificacionEnum.VERIFICADO, driverEmail],
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);
    const adminToken = adminLogin.body?.data?.token as string;

    const driverLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: driverEmail, password })
      .expect(200);
    const driverLoginToken = driverLogin.body?.data?.token as string;

    const passengerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: passengerEmail, password })
      .expect(200);
    const passengerToken = passengerLogin.body?.data?.token as string;

    const driverAuthVerified = await authRepo.findOne({
      where: { email: driverEmail },
    });
    expect(driverAuthVerified?.rol).toBe(RolUsuarioEnum.CONDUCTOR);
    expect(driverAuthVerified?.estadoVerificacion).toBe(
      EstadoVerificacionEnum.VERIFICADO,
    );

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not configured for tests');
    }

    const driverToken = await new EncryptJWT({
      role: RolUsuarioEnum.CONDUCTOR,
      isVerified: true,
    })
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setSubject(driverAuthVerified?.id ?? '')
      .setIssuer('wasigo-api')
      .setAudience('wasigo-app')
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime('8h')
      .encrypt(new TextEncoder().encode(jwtSecret));

    const businessRepo = dataSource.getRepository(BusinessUser);
    const driverBusiness = await businessRepo.findOne({
      where: { email: driverEmail },
    });
    const passengerBusiness = await businessRepo.findOne({
      where: { email: passengerEmail },
    });

    const driverRepo = dataSource.getRepository(Driver);
    const routeRepo = dataSource.getRepository(Route);
    const bookingRepo = dataSource.getRepository(Booking);
    const paymentRepo = dataSource.getRepository(Payment);

    const driver = driverRepo.create({
      publicId: await generatePublicId(driverRepo, 'DRV'),
      userId: driverBusiness?.id as string,
      paypalEmail: 'driver@epn.edu.ec',
      estado: EstadoConductorEnum.APROBADO,
      fechaAprobacion: new Date(),
    });
    await driverRepo.save(driver);

    const route = routeRepo.create({
      publicId: await generatePublicId(routeRepo, 'RTE'),
      driverId: driver.id,
      origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
      fecha: '2030-02-01',
      horaSalida: '08:00',
      destinoBase: 'Destino',
      asientosTotales: 2,
      asientosDisponibles: 1,
      precioPasajero: 3,
      estado: EstadoRutaEnum.ACTIVA,
    });
    await routeRepo.save(route);

    const booking = bookingRepo.create({
      publicId: await generatePublicId(bookingRepo, 'BKG'),
      routeId: route.id,
      passengerId: passengerBusiness?.id as string,
      estado: EstadoReservaEnum.COMPLETADA,
      otp: '123456',
      otpUsado: true,
      metodoPago: MetodoPagoEnum.EFECTIVO,
    });
    await bookingRepo.save(booking);

    const payment = paymentRepo.create({
      publicId: await generatePublicId(paymentRepo, 'PAY'),
      bookingId: booking.id,
      amount: 3,
      currency: 'USD',
      method: MetodoPagoEnum.EFECTIVO,
      status: EstadoPagoEnum.PAID,
      paidAt: new Date(),
    });
    await paymentRepo.save(payment);

    const passengerPayments = await request(app.getHttpServer())
      .get('/api/payments/my')
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(passengerPayments.body?.data?.data?.length).toBe(1);

    const passengerPaymentDetail = await request(app.getHttpServer())
      .get(`/api/payments/${payment.publicId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(passengerPaymentDetail.body?.data?.data?.publicId).toBe(
      payment.publicId,
    );

    const driverPayments = await request(app.getHttpServer())
      .get('/api/payments/driver')
      .set('Authorization', `Bearer ${driverToken || driverLoginToken}`)
      .expect(200);

    expect(driverPayments.body?.data?.data?.length).toBe(1);

    const adminPayments = await request(app.getHttpServer())
      .get('/api/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminPayments.body?.data?.total).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/payments/${payment.publicId}/reverse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const reversedPayment = await request(app.getHttpServer())
      .get(`/api/payments/${payment.publicId}`)
      .set('Authorization', `Bearer ${passengerToken}`)
      .expect(200);

    expect(reversedPayment.body?.data?.data?.status).toBe(
      EstadoPagoEnum.REVERSED,
    );
  });
});
