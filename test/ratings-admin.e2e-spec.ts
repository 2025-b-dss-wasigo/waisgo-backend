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
import { UserProfile } from '../src/modules/business/Models/user-profile.entity';
import { Driver } from '../src/modules/drivers/Models/driver.entity';
import { Route } from '../src/modules/routes/Models/route.entity';
import { Rating } from '../src/modules/ratings/Models/rating.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../src/modules/auth/Enum';
import { EstadoConductorEnum } from '../src/modules/drivers/Enums/estado-conductor.enum';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Admin ratings flows (e2e)', () => {
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

  it('lists ratings and low-rated users for admin', async () => {
    const suffix = Date.now().toString().slice(-6);
    const password = 'Segura.123';
    const adminEmail = `ra${suffix}@epn.edu.ec`;
    const driverEmail = `rd${suffix}@epn.edu.ec`;
    const passengerEmail = `rp${suffix}@epn.edu.ec`;

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

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(200);

    const adminToken = adminLogin.body?.data?.token as string;

    const businessRepo = dataSource.getRepository(BusinessUser);
    const profileRepo = dataSource.getRepository(UserProfile);
    const driverRepo = dataSource.getRepository(Driver);
    const routeRepo = dataSource.getRepository(Route);
    const ratingRepo = dataSource.getRepository(Rating);

    const driverBusiness = await businessRepo.findOne({
      where: { email: driverEmail },
    });
    const passengerBusiness = await businessRepo.findOne({
      where: { email: passengerEmail },
    });

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
      fecha: '2030-03-01',
      horaSalida: '08:00',
      destinoBase: 'Destino',
      asientosTotales: 2,
      asientosDisponibles: 1,
      precioPasajero: 2.5,
      estado: EstadoRutaEnum.FINALIZADA,
    });
    await routeRepo.save(route);

    const rating = ratingRepo.create({
      publicId: await generatePublicId(ratingRepo, 'RAT'),
      fromUserId: driverBusiness?.id as string,
      toUserId: passengerBusiness?.id as string,
      routeId: route.id,
      score: 2,
      comment: 'Regular',
    });
    await ratingRepo.save(rating);

    const passengerProfile = await profileRepo.findOne({
      where: { userId: passengerBusiness?.id as string },
    });
    if (passengerProfile) {
      passengerProfile.ratingPromedio = 2.5;
      passengerProfile.totalCalificaciones = 1;
      passengerProfile.isBloqueadoPorRating = true;
      await profileRepo.save(passengerProfile);
    }

    const ratingsRes = await request(app.getHttpServer())
      .get('/api/ratings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(ratingsRes.body?.data?.total).toBe(1);

    const lowRatedRes = await request(app.getHttpServer())
      .get('/api/ratings/low-rated')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(lowRatedRes.body?.data?.data?.length).toBeGreaterThan(0);
  });
});
