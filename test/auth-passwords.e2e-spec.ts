import request from 'supertest';
import { truncateAllTables } from './helpers/db';
import { AuthUser } from '../src/modules/auth/Models/auth-user.entity';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { createTestApp, TestAppContext } from './helpers/app';
import { buildUserSeed, registerUser, setUserRole } from './helpers/auth';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Auth password flows (e2e)', () => {
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

  it('resets password and revokes old tokens', async () => {
    const seed = buildUserSeed('rp', {
      nombre: 'Reset',
      apellido: 'User',
      celular: '0980000000',
    });
    const { email, password } = seed;
    const newPassword = 'Segura.456';

    await registerUser(ctx.app, seed);

    await setUserRole(ctx.dataSource, email, RolUsuarioEnum.PASAJERO, true);

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const oldToken = loginRes.body?.data?.accessToken as string;
    expect(oldToken).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await request(ctx.app.getHttpServer())
      .post('/api/auth/forgot-password')
      .send({ email })
      .expect(200);

    const authRepo = ctx.dataSource.getRepository(AuthUser);
    const authUser = await authRepo.findOne({ where: { email } });
    const resetToken = await ctx.redis.get(
      `reset:active:${authUser?.id ?? ''}`,
    );
    expect(resetToken).toBeTruthy();

    await request(ctx.app.getHttpServer())
      .post('/api/auth/reset-password')
      .send({ token: resetToken, newPassword })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
  });

  it('changes password and revokes token on logout', async () => {
    const seed = buildUserSeed('cp', {
      nombre: 'Change',
      apellido: 'User',
      celular: '0981111111',
    });
    const { email, password } = seed;
    const newPassword = 'Segura.789';

    await registerUser(ctx.app, seed);

    await setUserRole(ctx.dataSource, email, RolUsuarioEnum.PASAJERO, true);

    const loginRes = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const token = loginRes.body?.data?.accessToken as string;
    expect(token).toBeDefined();

    await request(ctx.app.getHttpServer())
      .patch('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: password, newPassword })
      .expect(200);

    const loginNew = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    const newToken = loginNew.body?.data?.accessToken as string;
    expect(newToken).toBeDefined();

    await request(ctx.app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(200);

    await request(ctx.app.getHttpServer())
      .get('/api/bookings/my')
      .set('Authorization', `Bearer ${newToken}`)
      .expect(401);
  });
});
