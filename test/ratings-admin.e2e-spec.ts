import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { UserProfile } from '../src/modules/business/Models/user-profile.entity';
import { Rating } from '../src/modules/ratings/Models/rating.entity';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { generatePublicId } from '../src/modules/common/utils/public-id.util';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  buildUserSeed,
  loginUser,
  registerUser,
  setUserRole,
} from './helpers/auth';
import {
  createDriver,
  createRoute,
  getBusinessUserFromAuth,
} from './helpers/fixtures';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Admin ratings flows (e2e)', () => {
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

  it('lists ratings and low-rated users for admin', async () => {
    const adminSeed = buildUserSeed('ra', {
      nombre: 'Admin',
      apellido: 'User',
      celular: '0980000000',
    });
    const driverSeed = buildUserSeed('rd', {
      nombre: 'Driver',
      apellido: 'User',
      celular: '0981111111',
    });
    const passengerSeed = buildUserSeed('rp', {
      nombre: 'Passenger',
      apellido: 'User',
      celular: '0982222222',
    });

    await registerUser(ctx.app, adminSeed);
    await registerUser(ctx.app, driverSeed);
    await registerUser(ctx.app, passengerSeed);

    await setUserRole(
      ctx.dataSource,
      adminSeed.email,
      RolUsuarioEnum.ADMIN,
      true,
    );
    await setUserRole(
      ctx.dataSource,
      driverSeed.email,
      RolUsuarioEnum.CONDUCTOR,
      true,
    );
    await setUserRole(
      ctx.dataSource,
      passengerSeed.email,
      RolUsuarioEnum.PASAJERO,
      true,
    );

    const adminToken = await loginUser(
      ctx.app,
      adminSeed.email,
      adminSeed.password,
    );

    const profileRepo = ctx.dataSource.getRepository(UserProfile);
    const ratingRepo = ctx.dataSource.getRepository(Rating);

    const driverBusiness = await getBusinessUserFromAuth(
      ctx.app,
      ctx.dataSource,
      driverSeed.email,
    );
    const passengerBusiness = await getBusinessUserFromAuth(
      ctx.app,
      ctx.dataSource,
      passengerSeed.email,
    );

    const driver = await createDriver(ctx.dataSource, {
      businessUserId: driverBusiness?.id as string,
      paypalEmail: 'driver@epn.edu.ec',
    });

    const route = await createRoute(ctx.dataSource, {
      driverId: driver.id,
      origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
      fecha: '2030-03-01',
      horaSalida: '08:00',
      asientosTotales: 2,
      asientosDisponibles: 1,
      precioPasajero: 2.5,
      estado: EstadoRutaEnum.FINALIZADA,
    });

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
      where: { businessUserId: passengerBusiness?.id as string },
    });
    if (passengerProfile) {
      passengerProfile.ratingPromedio = 2.5;
      passengerProfile.totalCalificaciones = 1;
      passengerProfile.isBloqueadoPorRating = true;
      await profileRepo.save(passengerProfile);
    }

    const ratingsRes = await request(ctx.app.getHttpServer())
      .get('/api/ratings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(ratingsRes.body?.data?.total).toBe(1);

    const lowRatedRes = await request(ctx.app.getHttpServer())
      .get('/api/ratings/low-rated')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(lowRatedRes.body?.data?.data?.length).toBeGreaterThan(0);
  });
});
