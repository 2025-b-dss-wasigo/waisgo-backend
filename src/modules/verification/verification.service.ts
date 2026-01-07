import { SendVerificationEmailOptions } from './../mail/Dto/Send-VerificationEmail.dto';
import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { EstadoVerificacionEnum } from '../auth/Enum';
import { BusinessService } from '../business/business.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import { isUUID } from 'class-validator';
import { IdentityResolverService } from '../identity';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly businessService: BusinessService,
    private readonly mailService: MailService,
    private readonly auditService: AuditService,
    private readonly identityResolver: IdentityResolverService,
  ) {}

  /**
   * Valida que el userId sea un UUID válido
   */
  private validateUserId(userId: string): void {
    if (!isUUID(userId)) {
      throw new BadRequestException(
        ErrorMessages.VALIDATION.INVALID_FORMAT('userId'),
      );
    }
  }

  /**
   * Sanitiza el código OTP (elimina espacios)
   */
  private sanitizeCode(code: string): string {
    return code.trim();
  }

  /**
   * Valida el formato del código OTP (6 dígitos)
   */
  private validateCodeFormat(code: string): void {
    if (!/^\d{6}$/.test(code)) {
      throw new BadRequestException(
        ErrorMessages.VERIFICATION.CODE_FORMAT_INVALID,
      );
    }
  }

  async sendVerification(
    businessUserId: string,
    context?: AuthContext,
  ): Promise<void> {
    // Validar UUID antes de cualquier operación
    this.validateUserId(businessUserId);

    // Resolver authUserId desde businessUserId
    const authUserId =
      await this.identityResolver.resolveAuthUserId(businessUserId);
    if (!authUserId) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    const user = await this.authService.findForVerification(authUserId);

    if (user.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO) {
      throw new BadRequestException(
        ErrorMessages.VERIFICATION.ALREADY_VERIFIED,
      );
    }

    const otp = await this.otpService.sendOtp(user.id);

    const displayName =
      await this.businessService.getDisplayName(businessUserId);

    const mailOptions: SendVerificationEmailOptions = {
      to: user.email,
      alias: displayName,
      code: otp.code,
      expiresInMinutes: otp.expiresInMinutes,
    };

    await this.mailService.sendVerificationEmail(mailOptions);

    // Auditar envío de código
    await this.auditService.logEvent({
      action: AuditAction.VERIFICATION_CODE_SENT,
      userId: businessUserId,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      result: AuditResult.SUCCESS,
      metadata: { email: user.email },
    });

    this.logger.log({
      message: 'Verification email sent',
      businessUserId,
      email: user.email,
      ip: context?.ip,
    });
  }

  async confirmVerification(
    businessUserId: string,
    code: string,
    context?: AuthContext,
  ): Promise<void> {
    // Validar UUID antes de cualquier operación
    this.validateUserId(businessUserId);

    // Sanitizar y validar código ANTES de consultar Redis
    const sanitizedCode = this.sanitizeCode(code);
    this.validateCodeFormat(sanitizedCode);

    // Resolver authUserId desde businessUserId
    const authUserId =
      await this.identityResolver.resolveAuthUserId(businessUserId);
    if (!authUserId) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    try {
      await this.otpService.validateOtp(authUserId, sanitizedCode);
      await this.authService.verifyUser(authUserId);

      // Limpiar todos los datos de OTP después de verificación exitosa
      await this.otpService.invalidateOtp(authUserId);

      // Auditar verificación exitosa
      await this.auditService.logEvent({
        action: AuditAction.VERIFICATION_SUCCESS,
        userId: businessUserId,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.SUCCESS,
      });

      this.logger.log({
        message: 'User verified successfully',
        businessUserId,
        ip: context?.ip,
      });
    } catch (error) {
      // Auditar verificación fallida
      await this.auditService.logEvent({
        action: AuditAction.VERIFICATION_FAILED,
        userId: businessUserId,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        result: AuditResult.FAILED,
        metadata: {
          reason: error instanceof Error ? error.message : 'unknown',
        },
      });

      throw error;
    }
  }
}
