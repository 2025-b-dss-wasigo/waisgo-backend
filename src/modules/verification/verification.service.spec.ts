import { BadRequestException } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { EstadoVerificacionEnum } from '../auth/Enum';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';

describe('VerificationService', () => {
  const authService = {
    findForVerification: jest.fn(),
    verifyUser: jest.fn(),
  };
  const otpService = {
    sendOtp: jest.fn(),
    validateOtp: jest.fn(),
    invalidateOtp: jest.fn(),
  };
  const businessService = {
    getDisplayName: jest.fn(),
  };
  const mailService = {
    sendVerificationEmail: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };

  const validUserId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

  let service: VerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    auditService.logEvent.mockResolvedValue(undefined);
    service = new VerificationService(
      authService as never,
      otpService as never,
      businessService as never,
      mailService as never,
      auditService as never,
    );
  });

  it('rejects invalid user ids before checking data', async () => {
    await expect(service.sendVerification('invalid-id')).rejects.toThrow(
      ErrorMessages.VALIDATION.INVALID_FORMAT('userId'),
    );
    expect(authService.findForVerification).not.toHaveBeenCalled();
  });

  it('rejects already verified users', async () => {
    authService.findForVerification.mockResolvedValue({
      id: validUserId,
      email: 'user@test.com',
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
    });

    await expect(service.sendVerification(validUserId)).rejects.toThrow(
      ErrorMessages.VERIFICATION.ALREADY_VERIFIED,
    );
  });

  it('sends verification emails and audits success', async () => {
    authService.findForVerification.mockResolvedValue({
      id: validUserId,
      email: 'user@test.com',
      estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
    });
    otpService.sendOtp.mockResolvedValue({
      code: '123456',
      expiresInMinutes: 5,
    });
    businessService.getDisplayName.mockResolvedValue('User');
    mailService.sendVerificationEmail.mockResolvedValue(undefined);
    const context = { ip: '127.0.0.1', userAgent: 'jest' };

    await service.sendVerification(validUserId, context);

    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'user@test.com',
      alias: 'User',
      code: '123456',
      expiresInMinutes: 5,
    });
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VERIFICATION_CODE_SENT,
        userId: validUserId,
        ipAddress: context.ip,
        userAgent: context.userAgent,
        result: AuditResult.SUCCESS,
      }),
    );
  });

  it('validates code format before redis operations', async () => {
    await expect(
      service.confirmVerification(validUserId, '12 34'),
    ).rejects.toThrow(ErrorMessages.VERIFICATION.CODE_FORMAT_INVALID);
    expect(otpService.validateOtp).not.toHaveBeenCalled();
  });

  it('verifies users, clears otp, and audits success', async () => {
    otpService.validateOtp.mockResolvedValue(undefined);
    authService.verifyUser.mockResolvedValue(undefined);
    otpService.invalidateOtp.mockResolvedValue(undefined);
    const context = { ip: '127.0.0.1', userAgent: 'jest' };

    await service.confirmVerification(validUserId, ' 123456 ', context);

    expect(otpService.validateOtp).toHaveBeenCalledWith(validUserId, '123456');
    expect(authService.verifyUser).toHaveBeenCalledWith(validUserId);
    expect(otpService.invalidateOtp).toHaveBeenCalledWith(validUserId);
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VERIFICATION_SUCCESS,
        result: AuditResult.SUCCESS,
      }),
    );
  });

  it('audits failures and rethrows verification errors', async () => {
    otpService.validateOtp.mockRejectedValue(
      new BadRequestException('bad-code'),
    );
    const context = { ip: '127.0.0.1', userAgent: 'jest' };

    await expect(
      service.confirmVerification(validUserId, '123456', context),
    ).rejects.toThrow('bad-code');

    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.VERIFICATION_FAILED,
        result: AuditResult.FAILED,
        metadata: expect.objectContaining({ reason: 'bad-code' }),
      }),
    );
  });
});
