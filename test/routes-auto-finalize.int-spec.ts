import { truncateAllTables } from './helpers/db';
import { RoutesService } from '../src/modules/routes/routes.service';
import { Route } from '../src/modules/routes/Models/route.entity';
import { CampusOrigenEnum, EstadoRutaEnum } from '../src/modules/routes/Enums';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  createBusinessUser,
  createDriver,
  createRoute,
} from './helpers/fixtures';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeRoutes = hasTestDb ? describe : describe.skip;

describeRoutes('Routes auto-finalize (integration)', () => {
  let ctx: TestAppContext;
  let routesService: RoutesService;

  beforeAll(async () => {
    ctx = await createTestApp({ useHttpDefaults: false });
    routesService = ctx.app.get(RoutesService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(ctx.dataSource);
    ctx.redis.clear();
  });

  it('finalizes expired routes without pending bookings', async () => {
    const driverUser = await createBusinessUser(ctx.dataSource, {
      alias: `driver${Date.now()}`.slice(0, 20),
    });

    const driver = await createDriver(ctx.dataSource, {
      businessUserId: driverUser.id,
      paypalEmail: 'driver@epn.edu.ec',
    });

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateString = yesterday.toISOString().slice(0, 10);

    const route = await createRoute(ctx.dataSource, {
      driverId: driver.id,
      origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
      fecha: dateString,
      horaSalida: '00:05',
      asientosTotales: 2,
      asientosDisponibles: 2,
      precioPasajero: 2.5,
      estado: EstadoRutaEnum.ACTIVA,
    });

    await routesService.autoFinalizeExpiredRoutes();

    const updated = await ctx.dataSource
      .getRepository(Route)
      .findOne({ where: { id: route.id } });
    expect(updated?.estado).toBe(EstadoRutaEnum.FINALIZADA);
  });
});
