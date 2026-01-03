import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthUser } from '../../src/modules/auth/Models/auth-user.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../../src/modules/auth/Enum';
import { InMemoryRedisService } from './fakes';

export type UserSeed = {
  email: string;
  password: string;
  confirmPassword?: string;
  nombre: string;
  apellido: string;
  celular: string;
};

export const buildUserSeed = (
  prefix: string,
  overrides: Partial<UserSeed> = {},
): UserSeed => {
  const suffix = Date.now().toString().slice(-6);
  return {
    email: `${prefix}${suffix}@epn.edu.ec`,
    password: 'Segura.123',
    confirmPassword: 'Segura.123',
    nombre: 'Test',
    apellido: 'User',
    celular: '0999999999',
    ...overrides,
  };
};

export const registerUser = async (
  app: INestApplication,
  seed: UserSeed,
): Promise<void> => {
  await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({
      ...seed,
      confirmPassword: seed.confirmPassword ?? seed.password,
    })
    .expect(201);
};

export const loginUser = async (
  app: INestApplication,
  email: string,
  password: string,
): Promise<string> => {
  const response = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);

  return response.body?.data?.token as string;
};

export const verifyUser = async (
  app: INestApplication,
  dataSource: DataSource,
  redis: InMemoryRedisService,
  email: string,
  token: string,
): Promise<AuthUser> => {
  await request(app.getHttpServer())
    .post('/api/verification/send')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  const authRepo = dataSource.getRepository(AuthUser);
  const authUser = await authRepo.findOne({ where: { email } });
  if (!authUser) {
    throw new Error(`Auth user not found for email ${email}`);
  }

  const otp = await redis.get(`otp:verify:${authUser.id}`);
  if (!otp) {
    throw new Error('Missing verification OTP');
  }

  await request(app.getHttpServer())
    .post('/api/verification/confirm')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: otp })
    .expect(200);

  return authUser;
};

export const registerAndVerifyUser = async (
  app: INestApplication,
  dataSource: DataSource,
  redis: InMemoryRedisService,
  seed: UserSeed,
): Promise<{ token: string; authUser: AuthUser }> => {
  await registerUser(app, seed);
  const initialToken = await loginUser(app, seed.email, seed.password);
  const authUser = await verifyUser(
    app,
    dataSource,
    redis,
    seed.email,
    initialToken,
  );
  const verifiedToken = await loginUser(app, seed.email, seed.password);
  return { token: verifiedToken, authUser };
};

export const setUserRole = async (
  dataSource: DataSource,
  email: string,
  role: RolUsuarioEnum,
  verified = true,
): Promise<AuthUser | null> => {
  const authRepo = dataSource.getRepository(AuthUser);
  await authRepo.update(
    { email },
    {
      rol: role,
      estadoVerificacion: verified
        ? EstadoVerificacionEnum.VERIFICADO
        : EstadoVerificacionEnum.NO_VERIFICADO,
    },
  );
  return authRepo.findOne({ where: { email } });
};
