import request from 'supertest';
import { StorageService } from '../src/modules/storage/storage.service';
import { FakeStorageService } from './helpers/fakes';
import { truncateAllTables } from './helpers/db';
import { RolUsuarioEnum } from '../src/modules/auth/Enum';
import { createTestApp, TestAppContext } from './helpers/app';
import {
  buildUserSeed,
  loginUser,
  registerUser,
  setUserRole,
} from './helpers/auth';

const hasTestDb = Boolean(process.env.TEST_DB_HOST);
const describeFlow = hasTestDb ? describe : describe.skip;

describeFlow('Business profile flows (e2e)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp({
      overrides: [
        {
          provide: StorageService,
          useValue: new FakeStorageService(),
        },
      ],
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await truncateAllTables(ctx.dataSource);
    ctx.redis.clear();
  });

  it('reads, updates, and deletes the user profile', async () => {
    const seed = buildUserSeed('bu', {
      nombre: 'Ana',
      apellido: 'Perez',
      celular: '0980000000',
    });

    await registerUser(ctx.app, seed);
    await setUserRole(
      ctx.dataSource,
      seed.email,
      RolUsuarioEnum.PASAJERO,
      true,
    );

    const token = await loginUser(ctx.app, seed.email, seed.password);
    expect(token).toBeDefined();

    const profileRes = await request(ctx.app.getHttpServer())
      .get('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(profileRes.body?.data?.email).toBe(seed.email);

    await request(ctx.app.getHttpServer())
      .patch('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Lucia', apellido: 'Gomez', celular: '0999999999' })
      .expect(200);

    const updatedProfile = await request(ctx.app.getHttpServer())
      .get('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(updatedProfile.body?.data?.nombre).toBe('Lucia');
    expect(updatedProfile.body?.data?.apellido).toBe('Gomez');
    expect(updatedProfile.body?.data?.celular).toBe('0999999999');

    // Valid PNG signature: 89 50 4E 47 0D 0A 1A 0A + minimal content
    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      // IHDR chunk start
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);

    await request(ctx.app.getHttpServer())
      .patch('/api/business/profile/photo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pngSignature, {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(200);

    const displayName = await request(ctx.app.getHttpServer())
      .get('/api/business/profile/display-name')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(displayName.body?.data).toContain('Lucia');

    await request(ctx.app.getHttpServer())
      .delete('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(ctx.app.getHttpServer())
      .get('/api/business/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
