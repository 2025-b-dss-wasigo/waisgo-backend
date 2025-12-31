import { Reflector } from '@nestjs/core';
import { jwtDecrypt } from 'jose';
import { JweAuthGuard } from './jwe-auth.guard';
import { ErrorMessages } from '../../common/constants/error-messages.constant';
import { RolUsuarioEnum } from '../Enum';

jest.mock('jose', () => ({
  jwtDecrypt: jest.fn(),
}));

describe('JweAuthGuard', () => {
  const configService = {
    get: jest.fn(() => 'a'.repeat(32)),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const redisService = {
    isTokenRevoked: jest.fn(),
    isUserSessionRevoked: jest.fn(),
  };

  const makeContext = (req: Record<string, unknown>) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows public routes', async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(true);
    const guard = new JweAuthGuard(
      configService as never,
      reflector,
      redisService as never,
    );

    await expect(
      guard.canActivate(makeContext({ headers: {} })),
    ).resolves.toBe(true);
  });

  it('rejects missing token', async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    const guard = new JweAuthGuard(
      configService as never,
      reflector,
      redisService as never,
    );

    await expect(
      guard.canActivate(makeContext({ headers: {} })),
    ).rejects.toThrow(ErrorMessages.SYSTEM.TOKEN_REQUIRED);
  });

  it('sets request user when token is valid', async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    const guard = new JweAuthGuard(
      configService as never,
      reflector,
      redisService as never,
    );

    (jwtDecrypt as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'user-id',
        role: RolUsuarioEnum.USER,
        isVerified: true,
        jti: 'jti',
        iat: 1,
        exp: Math.floor(Date.now() / 1000) + 60,
        iss: 'wasigo-api',
        aud: 'wasigo-app',
      },
    });
    redisService.isTokenRevoked.mockResolvedValue(false);
    redisService.isUserSessionRevoked.mockResolvedValue(false);

    const req = {
      headers: { authorization: 'Bearer a.b.c.d.e' },
    } as never;

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect((req as { user?: unknown }).user).toMatchObject({
      id: 'user-id',
      role: RolUsuarioEnum.USER,
      isVerified: true,
      jti: 'jti',
    });
  });

  it('rejects revoked tokens', async () => {
    reflector.getAllAndOverride = jest.fn().mockReturnValue(false);
    const guard = new JweAuthGuard(
      configService as never,
      reflector,
      redisService as never,
    );

    (jwtDecrypt as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'user-id',
        role: RolUsuarioEnum.USER,
        isVerified: true,
        jti: 'jti',
        iat: 1,
        exp: Math.floor(Date.now() / 1000) + 60,
        iss: 'wasigo-api',
        aud: 'wasigo-app',
      },
    });
    redisService.isTokenRevoked.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        makeContext({
          headers: { authorization: 'Bearer a.b.c.d.e' },
        }),
      ),
    ).rejects.toThrow(ErrorMessages.SYSTEM.TOKEN_REVOKED);
  });
});
