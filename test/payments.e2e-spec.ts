import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { MailService } from '../src/modules/mail/mail.service';
import { ResponseInterceptor } from '../src/modules/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../src/modules/common/filters/global-exception.filter';
import { AuditService } from '../src/modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { InMemoryRedisService, NoopMailService } from './helpers/fakes';
import { truncateAllTables } from './helpers/db';
import { BusinessUser } from '../src/modules/business/Models/business-user.entity';
import { AuthUser } from '../src/modules/auth/Models/auth-user.entity';
import { Driver } from '../src/modules/drivers/Models/driver.entity';
import { Route } from '../src/modules/routes/Models/route.entity';
import { Booking } from '../src/modules/bookings/Models/booking.entity';
import { Payment } from '../src/modules/payments/Models/payment.entity';
import { EstadoConductorEnum } from '../src/modules/drivers/Enums/estado-conductor.enum';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum } from '../src/modules/payments/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describePayments = hasTestDb ? describe : describe.skip;

describePayments('Payments idempotency (e2e)', () => {
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

  it('returns the same payment for repeated idempotent requests', async () => {
    const suffix = Date.now().toString().slice(-6);
    const email = `py${suffix}@epn.edu.ec`;
    const password = 'Segura.123';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email,
        password,
        nombre: 'Juan',
        apellido: 'Perez',
        celular: '0987654321',
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const userToken = loginRes.body?.data?.token as string;
    expect(userToken).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/verification/send')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    const authRepo = dataSource.getRepository(AuthUser);
    const authUser = await authRepo.findOne({ where: { email } });
    const otp = await redis.get(`otp:verify:${authUser?.id ?? ''}`);
    expect(otp).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/verification/confirm')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ code: otp })
      .expect(200);

    const loginVerified = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const token = loginVerified.body?.data?.token as string;
    expect(token).toBeDefined();

    const authUserId = await dataSource.query(
      'SELECT id FROM auth.auth_users WHERE email = $1',
      [email],
    );
    const passengerId = authUserId?.[0]?.id as string;

    const businessRepo = dataSource.getRepository(BusinessUser);
    const driverRepo = dataSource.getRepository(Driver);
    const routeRepo = dataSource.getRepository(Route);
    const bookingRepo = dataSource.getRepository(Booking);
    const paymentRepo = dataSource.getRepository(Payment);

    const driverUserId = randomUUID();
    const driverBusiness = businessRepo.create({
      id: driverUserId,
      publicId: await generatePublicId(businessRepo, 'USR'),
      email: `dr${suffix}@epn.edu.ec`,
      alias: `driver${suffix}`.slice(0, 20),
    });
    await businessRepo.save(driverBusiness);

    const driver = driverRepo.create({
      publicId: await generatePublicId(driverRepo, 'DRV'),
      userId: driverUserId,
      paypalEmail: 'driver@epn.edu.ec',
      estado: EstadoConductorEnum.APROBADO,
      fechaAprobacion: new Date(),
    });
    await driverRepo.save(driver);

    const route = routeRepo.create({
      publicId: await generatePublicId(routeRepo, 'RTE'),
      driverId: driver.id,
      origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
      fecha: '2030-01-01',
      horaSalida: '08:00',
      destinoBase: 'Destino',
      asientosTotales: 3,
      asientosDisponibles: 3,
      precioPasajero: 2.5,
      estado: EstadoRutaEnum.ACTIVA,
    });
    await routeRepo.save(route);

    const booking = bookingRepo.create({
      publicId: await generatePublicId(bookingRepo, 'BKG'),
      routeId: route.id,
      passengerId,
      estado: EstadoReservaEnum.CONFIRMADA,
      otp: '123456',
      otpUsado: false,
      metodoPago: MetodoPagoEnum.PAYPAL,
    });
    await bookingRepo.save(booking);

    const idempotencyKey = 'PAYIDEMP1';

    const first = await request(app.getHttpServer())
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ bookingId: booking.publicId, method: MetodoPagoEnum.PAYPAL })
      .expect(201);

    const second = await request(app.getHttpServer())
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
