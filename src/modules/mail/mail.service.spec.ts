import { InternalServerErrorException } from '@nestjs/common';
import { MailService } from './mail.service';
import { AuditAction, AuditResult } from '../audit/Enums';

describe('MailService', () => {
  const mailerService = {
    sendMail: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };

  let service: MailService;

  beforeEach(() => {
    jest.clearAllMocks();
    mailerService.sendMail.mockResolvedValue(undefined);
    auditService.logEvent.mockResolvedValue(undefined);
    service = new MailService(mailerService as never, auditService as never);
  });

  it('uses fallback name for reset password emails', async () => {
    await service.sendResetPasswordEmail({
      to: 'user@test.com',
      resetUrl: 'https://example.com/reset',
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        template: 'reset-password',
        context: expect.objectContaining({
          name: 'Usuario',
          resetUrl: 'https://example.com/reset',
        }),
      }),
    );
  });

  it('sanitizes alias for verification emails', async () => {
    await service.sendVerificationEmail({
      to: 'user@test.com',
      alias: '<Admin & Co>',
      code: '123456',
      expiresInMinutes: 5,
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        template: 'verification',
        context: expect.objectContaining({
          alias: '&lt;Admin &amp; Co&gt;',
          code: '123456',
          expires: 5,
        }),
      }),
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMAIL_SENT,
        result: AuditResult.SUCCESS,
      }),
    );
  });

  it('sanitizes generic email content', async () => {
    await service.sendGenericEmail({
      to: 'user@test.com',
      subject: 'Hello',
      message: "Hi <b>team</b> & \"friends'\"",
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'generic',
        context: {
          message: 'Hi &lt;b&gt;team&lt;/b&gt; &amp; &quot;friends&#x27;&quot;',
        },
      }),
    );
  });

  it('logs failures and rethrows as internal errors', async () => {
    mailerService.sendMail.mockRejectedValueOnce(new Error('smtp down'));

    await expect(
      service.sendGenericEmail({
        to: 'user@test.com',
        subject: 'Hello',
        message: 'test',
      }),
    ).rejects.toThrow(InternalServerErrorException);

    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.EMAIL_FAILED,
        result: AuditResult.FAILED,
        metadata: expect.objectContaining({
          template: 'generic',
          recipient: 'user@test.com',
          error: 'smtp down',
        }),
      }),
    );
  });

  it('continues sending notifications when one email fails', async () => {
    mailerService.sendMail
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(undefined);

    await service.sendDriverApplicationNotification(
      ['admin1@test.com', 'admin2@test.com'],
      {
        applicantName: 'Driver',
        applicantEmail: 'driver@test.com',
        paypalEmail: 'driver@paypal.com',
        applicationDate: '2024-01-01',
      },
    );

    expect(mailerService.sendMail).toHaveBeenCalledTimes(2);
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.EMAIL_FAILED }),
    );
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.EMAIL_SENT }),
    );
  });
});
