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
import { Route } from '../src/modules/routes/Models/route.entity';
import { Booking } from '../src/modules/bookings/Models/booking.entity';
import { Payment } from '../src/modules/payments/Models/payment.entity';
import { Payout } from '../src/modules/payments/Models/payout.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../src/modules/auth/Enum';
import { EstadoConductorEnum } from '../src/modules/drivers/Enums/estado-conductor.enum';
import { CampusOrigenEnum } from '../src/modules/routes/Enums';
import { EstadoReservaEnum } from '../src/modules/bookings/Enums';
import { MetodoPagoEnum, EstadoPagoEnum, EstadoPayoutEnum } from '../src/modules/payments/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';
import { mockPaypalFetch, restoreFetch } from './helpers/paypal-mock';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describePayouts = hasTestDb ? describe : describe.skip;

describePayouts('Payouts flow (e2e)', () => {
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

  it('generates, executes, and fails a payout', async () => {
    const password = 'Segura.123';
    const suffix = Date.now().toString().slice(-6);
    const adminEmail = `pa${suffix}@epn.edu.ec`;
    const driverEmail = `pd${suffix}@epn.edu.ec`;
    const passengerEmail = `pp${suffix}@epn.edu.ec`;

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

    const authRepo = dataSource.getRepository(AuthUser);
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
      .post('/api/auth/register')
      .send({
        email: driverEmail,
        password,
        nombre: 'Driver',
        apellido: 'User',
        celular: '0981111111',
      })
      .expect(201);

    await authRepo.update(
      { email: driverEmail },
      {
        rol: RolUsuarioEnum.CONDUCTOR,
        estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      },
    );

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

    const businessRepo = dataSource.getRepository(BusinessUser);
    const driverBusiness = await businessRepo.findOne({
      where: { email: driverEmail },
    });
    const passengerBusiness = await businessRepo.findOne({
      where: { email: passengerEmail },
    });

    const driverRepo = dataSource.getRepository(Driver);
    const driver = driverRepo.create({
      publicId: await generatePublicId(driverRepo, 'DRV'),
      userId: driverBusiness?.id as string,
      paypalEmail: 'driver@epn.edu.ec',
      estado: EstadoConductorEnum.APROBADO,
      fechaAprobacion: new Date(),
    });
    await driverRepo.save(driver);

    const routeRepo = dataSource.getRepository(Route);
    const route = routeRepo.create({
      publicId: await generatePublicId(routeRepo, 'RTE'),
      driverId: driver.id,
      origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
      fecha: '2025-01-10',
      horaSalida: '08:00',
      destinoBase: 'Destino',
      asientosTotales: 3,
      asientosDisponibles: 2,
      precioPasajero: 2.5,
    });
    await routeRepo.save(route);

    const bookingRepo = dataSource.getRepository(Booking);
    const booking = bookingRepo.create({
      publicId: await generatePublicId(bookingRepo, 'BKG'),
      routeId: route.id,
      passengerId: passengerBusiness?.id as string,
      estado: EstadoReservaEnum.COMPLETADA,
      otp: '123456',
      otpUsado: true,
      metodoPago: MetodoPagoEnum.PAYPAL,
    });
    await bookingRepo.save(booking);

    const paymentRepo = dataSource.getRepository(Payment);
    const payment = paymentRepo.create({
      publicId: await generatePublicId(paymentRepo, 'PAY'),
      bookingId: booking.id,
      amount: 6,
      currency: 'USD',
      method: MetodoPagoEnum.PAYPAL,
      status: EstadoPagoEnum.PAID,
      paidAt: new Date('2025-01-10T12:00:00Z'),
    });
    await paymentRepo.save(payment);

    await request(app.getHttpServer())
      .post('/api/payouts/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ period: '2025-01' })
      .expect(201);

    const payoutRepo = dataSource.getRepository(Payout);
    const payout = await payoutRepo.findOne({
      where: { driverId: driver.id },
    });
    expect(payout).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/payouts/${payout?.publicId}/paypal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const paidPayout = await payoutRepo.findOne({
      where: { id: payout?.id },
    });
    expect(paidPayout?.status).toBe(EstadoPayoutEnum.PAID);

    await request(app.getHttpServer())
      .patch(`/api/payouts/${payout?.publicId}/fail`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Manual fail' })
      .expect(200);

    const failedPayout = await payoutRepo.findOne({
      where: { id: payout?.id },
    });
    expect(failedPayout?.status).toBe(EstadoPayoutEnum.FAILED);
  });
});
