import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EstadoVerificacionEnum, RolUsuarioEnum } from './Enum';
import { AuditAction } from '../audit/Enums';
import * as bcrypt from 'bcrypt';
import { EncryptJWT } from 'jose';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('jose', () => ({
  EncryptJWT: jest.fn(),
}));

describe('AuthService', () => {
  const authUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const dataSource = {
    createQueryRunner: jest.fn(),
  };
  const businessService = {
    createFromAuthWithManager: jest.fn(),
    getDisplayName: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };
  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const mailService = {
    sendResetPasswordEmail: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === 'JWT_SECRET') return 'a'.repeat(32);
      if (key === 'JWT_EXPIRES_IN') return '8h';
      if (key === 'MAX_FAILED_ATTEMPTS') return 2;
      if (key === 'BLOCK_TIME_MINUTES') return 1;
      if (key === 'RESET_TOKEN_EXPIRY_MINUTES') return 30;
      if (key === 'MAX_RESET_ATTEMPTS') return 3;
      if (key === 'NODE_ENV') return 'development';
      if (key === 'FRONTEND_URL') return 'http://frontend';
      return fallback ?? null;
    });

    service = new AuthService(
      authUserRepo as never,
      dataSource as never,
      businessService as never,
      configService as never,
      auditService as never,
      redisService as never,
      mailService as never,
    );
  });

  it('throws when credentials are missing', async () => {
    authUserRepo.findOne.mockResolvedValue(null);

    await expect(
      service.login({ email: 'test@epn.edu.ec', password: 'pass' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws when account is blocked', async () => {
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      rol: RolUsuarioEnum.USER,
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      bloqueadoHasta: new Date(Date.now() + 60 * 1000),
      credential: { passwordHash: 'hash', failedAttempts: 0 },
    });

    await expect(
      service.login({ email: 'test@epn.edu.ec', password: 'pass' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws when password is invalid and increments attempts', async () => {
    const user = {
      id: 'user-id',
      rol: RolUsuarioEnum.USER,
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      bloqueadoHasta: null,
      credential: { passwordHash: 'hash', failedAttempts: 0 },
    };
    authUserRepo.findOne.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'test@epn.edu.ec', password: 'pass' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.LOGIN_FAILED,
        userId: 'user-id',
      }),
    );
    expect(authUserRepo.save).toHaveBeenCalled();
    expect(user.credential.failedAttempts).toBe(1);
  });

  it('returns token when credentials are valid', async () => {
    const user = {
      id: 'user-id',
      rol: RolUsuarioEnum.USER,
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      bloqueadoHasta: null,
      credential: { passwordHash: 'hash', failedAttempts: 1 },
    };
    authUserRepo.findOne.mockResolvedValue(user);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    (EncryptJWT as jest.Mock).mockImplementation(() => ({
      setProtectedHeader: jest.fn().mockReturnThis(),
      setSubject: jest.fn().mockReturnThis(),
      setIssuer: jest.fn().mockReturnThis(),
      setAudience: jest.fn().mockReturnThis(),
      setJti: jest.fn().mockReturnThis(),
      setIssuedAt: jest.fn().mockReturnThis(),
      setExpirationTime: jest.fn().mockReturnThis(),
      encrypt: jest.fn().mockResolvedValue('token'),
    }));

    const response = await service.login({
      email: 'test@epn.edu.ec',
      password: 'pass',
    });

    expect(response).toEqual({ token: 'token', expiresIn: 28800 });
    expect(authUserRepo.save).toHaveBeenCalled();
  });

  it('forgotPassword throws in dev when email is missing', async () => {
    authUserRepo.findOne.mockResolvedValue(null);

    await expect(
      service.forgotPassword('missing@epn.edu.ec'),
    ).rejects.toThrow(NotFoundException);

    expect(auditService.logEvent).toHaveBeenCalled();
  });
});
