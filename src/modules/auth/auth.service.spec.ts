import {
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { EstadoVerificacionEnum, RolUsuarioEnum } from './Enum';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
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
    create: jest.fn(),
    find: jest.fn(),
  };
  const dataSource = {
    createQueryRunner: jest.fn(),
  };
  const businessService = {
    createFromAuthWithManager: jest.fn(),
    getDisplayName: jest.fn(),
    findById: jest.fn().mockResolvedValue({
      id: 'business-user-id',
      publicId: 'USR_123',
      alias: 'Alias',
    }),
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
    revokeUserSessions: jest.fn(),
  };
  const mailService = {
    sendResetPasswordEmail: jest.fn(),
  };

  const identityResolver = {
    createMappingWithManager: jest.fn(),
    resolveBusinessUserId: jest.fn().mockResolvedValue('business-user-id'),
    resolveAuthUserId: jest.fn().mockResolvedValue('user-id'),
    getDeterministicHash: jest.fn().mockResolvedValue('hash123'),
  };

  const identityHashService = {
    generateDeterministicHash: jest.fn().mockReturnValue('hash123'),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  };

  const buildQueryRunner = () => {
    const manager = {
      save: jest.fn(),
      findOne: jest.fn(),
    };

    return {
      manager,
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
  };

  const registerDto = {
    email: 'test@epn.edu.ec',
    password: 'Passw0rd!',
    confirmPassword: 'Passw0rd!',
    nombre: 'Juan',
    apellido: 'Perez',
    celular: '0999999999',
  };

  const structuredLogger = {
    logSuccess: jest.fn(),
    logFailure: jest.fn(),
    logDenied: jest.fn(),
    logCritical: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === 'JWT_SECRET') return 'a'.repeat(32);
      if (key === 'JWT_EXPIRES_IN') return '15m';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      if (key === 'MAX_FAILED_ATTEMPTS') return 2;
      if (key === 'BLOCK_TIME_MINUTES') return 1;
      if (key === 'RESET_TOKEN_EXPIRY_MINUTES') return 30;
      if (key === 'MAX_RESET_ATTEMPTS') return 3;
      if (key === 'NODE_ENV') return 'development';
      if (key === 'FRONTEND_URL') return 'http://frontend';
      return fallback ?? null;
    });
    authUserRepo.create.mockImplementation(
      (input: Record<string, unknown>) => ({
        ...input,
      }),
    );

    service = new AuthService(
      authUserRepo as never,
      dataSource as never,
      businessService as never,
      configService as never,
      auditService as never,
      redisService as never,
      mailService as never,
      structuredLogger as never,
      identityResolver as never,
      identityHashService as never,
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
        userId: 'hash123', // Now uses deterministic hash instead of user-id
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

    expect(response).toEqual({
      accessToken: 'token',
      refreshToken: 'token',
      expiresIn: 900,
      refreshExpiresIn: 604800,
      role: RolUsuarioEnum.USER,
    });
    expect(authUserRepo.save).toHaveBeenCalled();
  });

  it('forgotPassword throws in dev when email is missing', async () => {
    authUserRepo.findOne.mockResolvedValue(null);

    await expect(service.forgotPassword('missing@epn.edu.ec')).rejects.toThrow(
      NotFoundException,
    );

    expect(auditService.logEvent).toHaveBeenCalled();
  });

  it('register throws when email already exists', async () => {
    authUserRepo.findOne.mockResolvedValue({ id: 'existing' });

    await expect(service.register(registerDto)).rejects.toThrow(
      ErrorMessages.AUTH.EMAIL_ALREADY_EXISTS,
    );
  });

  it('register commits transaction and returns success message', async () => {
    const queryRunner = buildQueryRunner();
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    authUserRepo.findOne.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    queryRunner.manager.save.mockResolvedValue({ id: 'user-id' });
    businessService.createFromAuthWithManager.mockResolvedValue({
      businessUserId: 'business-user-id',
      publicId: 'USR_123',
      alias: 'Alias',
    });

    const response = await service.register(registerDto, {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(response).toEqual({
      success: true,
      message: ErrorMessages.AUTH.ACCOUNT_CREATE,
    });
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.REGISTER,
        result: AuditResult.SUCCESS,
        userId: expect.any(String),
      }),
    );
  });

  it('register rolls back transaction when creation fails', async () => {
    const queryRunner = buildQueryRunner();
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    authUserRepo.findOne.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    businessService.createFromAuthWithManager.mockRejectedValue(
      new Error('fail'),
    );

    await expect(service.register(registerDto)).rejects.toThrow('fail');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('login throws internal error on unexpected failures', async () => {
    authUserRepo.findOne.mockRejectedValue(new Error('db down'));

    await expect(
      service.login({ email: 'test@epn.edu.ec', password: 'pass' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('forgotPassword returns generic message in production for missing user', async () => {
    configService.get.mockImplementationOnce(() => 'production');
    authUserRepo.findOne.mockResolvedValue(null);

    const response = await service.forgotPassword('missing@epn.edu.ec');

    expect(response).toEqual({
      message: ErrorMessages.AUTH.RESET_EMAIL_SENT,
    });
    expect(mailService.sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('forgotPassword returns generic message in production for unverified user', async () => {
    configService.get.mockImplementationOnce(() => 'production');
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'user@epn.edu.ec',
      estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
    });

    const response = await service.forgotPassword('user@epn.edu.ec');

    expect(response).toEqual({
      message: ErrorMessages.AUTH.RESET_EMAIL_SENT,
    });
    expect(mailService.sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('forgotPassword blocks when reset limit is exceeded', async () => {
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'user@epn.edu.ec',
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
    });
    redisService.get.mockResolvedValueOnce('3');

    await expect(service.forgotPassword('user@epn.edu.ec')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('forgotPassword clears old token and increments reset limit', async () => {
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'user@epn.edu.ec',
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
    });
    businessService.getDisplayName.mockResolvedValue('User');
    redisService.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('old-token')
      .mockResolvedValueOnce('1');

    await service.forgotPassword('user@epn.edu.ec');

    expect(redisService.del).toHaveBeenCalledWith('reset:token:old-token');
    expect(redisService.set).toHaveBeenCalledWith(
      'reset:limit:user-id',
      2,
      3600,
    );
    expect(mailService.sendResetPasswordEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@epn.edu.ec',
        resetUrl: expect.stringContaining(
          'http://frontend/reset-password?token=',
        ),
      }),
    );
  });

  it('resetPassword rejects invalid token format', async () => {
    await expect(
      service.resetPassword('not-a-uuid', 'NewPass1!'),
    ).rejects.toThrow(BadRequestException);
    expect(redisService.get).not.toHaveBeenCalled();
  });

  it('resetPassword rejects when token is missing', async () => {
    redisService.get.mockResolvedValue(null);

    await expect(
      service.resetPassword(
        'd290f1ee-6c54-4b01-90e6-d701748f0851',
        'NewPass1!',
      ),
    ).rejects.toThrow(ErrorMessages.AUTH.RESET_TOKEN_INVALID);
  });

  it('resetPassword rejects when user is missing', async () => {
    redisService.get.mockResolvedValue('user-id');
    authUserRepo.findOne.mockResolvedValue(null);

    await expect(
      service.resetPassword(
        'd290f1ee-6c54-4b01-90e6-d701748f0851',
        'NewPass1!',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('resetPassword updates credentials and revokes sessions', async () => {
    const user = {
      id: 'user-id',
      credential: { passwordHash: 'hash' },
    };
    redisService.get.mockResolvedValue('user-id');
    authUserRepo.findOne.mockResolvedValue(user);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    const response = await service.resetPassword(
      'd290f1ee-6c54-4b01-90e6-d701748f0851',
      'NewPass1!',
      { ip: '127.0.0.1', userAgent: 'jest' },
    );

    expect(response).toEqual({
      message: ErrorMessages.AUTH.PASSWORD_RESET_SUCCESS,
    });
    expect(redisService.del).toHaveBeenCalledWith(
      'reset:token:d290f1ee-6c54-4b01-90e6-d701748f0851',
    );
    expect(redisService.del).toHaveBeenCalledWith('reset:active:user-id');
    expect(redisService.revokeUserSessions).toHaveBeenCalledWith(
      'business-user-id',
      604800,
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PASSWORD_RESET_COMPLETE,
        result: AuditResult.SUCCESS,
      }),
    );
  });

  it('logout stores revoke token and audits logout', async () => {
    const response = await service.logout('jti-1', 120, 'user-id', {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(response).toEqual({ message: ErrorMessages.AUTH.LOGOUT_SUCCESS });
    expect(redisService.set).toHaveBeenCalledWith(
      'revoke:jti:jti-1',
      'REVOKED',
      120,
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.LOGOUT,
        userId: 'user-id',
      }),
    );
  });

  it('changePassword rejects when current password is invalid', async () => {
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      credential: { passwordHash: 'hash' },
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.changePassword('user-id', 'old', 'new'),
    ).rejects.toThrow(BadRequestException);

    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PASSWORD_CHANGE_FAILED,
        result: AuditResult.FAILED,
      }),
    );
    expect(authUserRepo.save).not.toHaveBeenCalled();
  });

  it('changePassword rejects when new password matches old', async () => {
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      credential: { passwordHash: 'hash' },
    });
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await expect(
      service.changePassword('user-id', 'old', 'old'),
    ).rejects.toThrow(ErrorMessages.AUTH.PASSWORD_SAME_AS_OLD);
  });

  it('changePassword updates password when valid', async () => {
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      credential: { passwordHash: 'hash' },
    });
    (bcrypt.compare as jest.Mock)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

    const response = await service.changePassword('user-id', 'old', 'new', {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(response).toEqual({
      message: ErrorMessages.AUTH.PASSWORD_CHANGE_SUCCESS,
    });
    expect(authUserRepo.save).toHaveBeenCalled();
    expect(redisService.revokeUserSessions).toHaveBeenCalledWith(
      'user-id',
      604800,
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.PASSWORD_CHANGE,
        result: AuditResult.SUCCESS,
      }),
    );
  });

  it('findForVerification throws when user is missing', async () => {
    authUserRepo.findOne.mockResolvedValue(null);

    await expect(service.findForVerification('user-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('findForVerification returns user data', async () => {
    authUserRepo.findOne.mockResolvedValue({
      id: 'user-id',
      email: 'user@epn.edu.ec',
      estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
    });

    const user = await service.findForVerification('user-id');

    expect(user).toEqual(
      expect.objectContaining({
        id: 'user-id',
        email: 'user@epn.edu.ec',
      }),
    );
  });

  it('verifyUser rolls back when already verified', async () => {
    const queryRunner = buildQueryRunner();
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    queryRunner.manager.findOne.mockResolvedValue({
      id: 'user-id',
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      rol: RolUsuarioEnum.PASAJERO,
    });

    await service.verifyUser('user-id');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.manager.save).not.toHaveBeenCalled();
  });

  it('verifyUser updates user and commits transaction', async () => {
    const queryRunner = buildQueryRunner();
    dataSource.createQueryRunner.mockReturnValue(queryRunner);
    const user = {
      id: 'user-id',
      estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
      rol: RolUsuarioEnum.USER,
    };
    queryRunner.manager.findOne.mockResolvedValue(user);

    await service.verifyUser('user-id');

    expect(user.estadoVerificacion).toBe(EstadoVerificacionEnum.VERIFICADO);
    expect(user.rol).toBe(RolUsuarioEnum.PASAJERO);
    expect(queryRunner.manager.save).toHaveBeenCalledWith(user);
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('getAdminEmails returns admin emails', async () => {
    authUserRepo.find.mockResolvedValue([
      { email: 'admin1@epn.edu.ec' },
      { email: 'admin2@epn.edu.ec' },
    ]);

    const emails = await service.getAdminEmails();

    expect(emails).toEqual(['admin1@epn.edu.ec', 'admin2@epn.edu.ec']);
  });
});
