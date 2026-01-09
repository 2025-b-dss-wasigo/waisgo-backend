/**
 * Pruebas unitarias de otp.
 */

import { OtpService } from './otp.service';
import { ErrorMessages } from '../common/constants/error-messages.constant';

describe('OtpService', () => {
  const redisService = {
    get: jest.fn(),
    saveOtpSession: jest.fn(),
    incr: jest.fn(),
    del: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };

  let service: OtpService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation(
      (key: string, defaultValue?: number) => {
        if (key === 'OTP_EXPIRATION_MINUTES') return 2;
        if (key === 'MAX_OTP_ATTEMPTS') return 3;
        if (key === 'MAX_OTP_RESENDS') return 2;
        return defaultValue;
      },
    );
    service = new OtpService(redisService as never, configService as never);
  });

  it('generates a 6 digit code', () => {
    const code = service.generateOtp();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('throws when max resends reached', async () => {
    redisService.get.mockResolvedValue('2');

    await expect(service.sendOtp('user-id')).rejects.toThrow(
      ErrorMessages.VERIFICATION.RESEND_LIMIT,
    );
    expect(redisService.saveOtpSession).not.toHaveBeenCalled();
  });

  it('stores otp session and returns expiry minutes', async () => {
    redisService.get.mockResolvedValue('1');
    const otpSpy = jest.spyOn(service, 'generateOtp').mockReturnValue('123456');

    const result = await service.sendOtp('user-id');

    expect(redisService.saveOtpSession).toHaveBeenCalledWith(
      'otp:verify:user-id',
      '123456',
      120,
      'otp:verify:attempts:user-id',
      'otp:verify:resend:user-id',
      1,
    );
    expect(result).toEqual({ code: '123456', expiresInMinutes: 2 });

    otpSpy.mockRestore();
  });

  it('rejects invalid code format before hitting redis', async () => {
    await expect(service.validateOtp('user-id', '12ab')).rejects.toThrow(
      ErrorMessages.VERIFICATION.CODE_FORMAT_INVALID,
    );
    expect(redisService.get).not.toHaveBeenCalled();
  });

  it('rejects expired otp', async () => {
    redisService.get.mockResolvedValue(null);

    await expect(service.validateOtp('user-id', '123456')).rejects.toThrow(
      ErrorMessages.VERIFICATION.CODE_EXPIRED,
    );
  });

  it('tracks attempts and reports attempts left', async () => {
    redisService.get.mockResolvedValue('111111');
    redisService.incr.mockResolvedValue(1);

    await expect(service.validateOtp('user-id', '222222')).rejects.toThrow(
      ErrorMessages.VERIFICATION.CODE_ATTEMPTS_LEFT(2),
    );
    expect(redisService.del).not.toHaveBeenCalled();
  });

  it('blocks when max attempts reached', async () => {
    redisService.get.mockResolvedValue('111111');
    redisService.incr.mockResolvedValue(3);

    await expect(service.validateOtp('user-id', '222222')).rejects.toThrow(
      ErrorMessages.VERIFICATION.MAX_ATTEMPTS_REACHED,
    );
    expect(redisService.del).toHaveBeenCalledWith(
      'otp:verify:user-id',
      'otp:verify:attempts:user-id',
    );
  });

  it('clears keys when otp is valid', async () => {
    redisService.get.mockResolvedValue('123456');

    await service.validateOtp('user-id', '123456');

    expect(redisService.del).toHaveBeenCalledWith(
      'otp:verify:user-id',
      'otp:verify:attempts:user-id',
    );
  });

  it('returns remaining attempts', async () => {
    redisService.get.mockResolvedValueOnce('2').mockResolvedValueOnce(null);

    const remaining = await service.getRemainingAttempts('user-id');
    const remainingDefault = await service.getRemainingAttempts('user-id');

    expect(remaining).toBe(1);
    expect(remainingDefault).toBe(3);
  });

  it('invalidates otp data', async () => {
    await service.invalidateOtp('user-id');

    expect(redisService.del).toHaveBeenCalledWith(
      'otp:verify:user-id',
      'otp:verify:attempts:user-id',
      'otp:verify:resend:user-id',
    );
  });

  it('secureCompare returns false for mismatched lengths', () => {
    const secureCompare = (
      service as unknown as {
        secureCompare: (a: string, b: string) => boolean;
      }
    ).secureCompare;

    expect(secureCompare('123', '12')).toBe(false);
  });
});
