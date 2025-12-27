import { SendResetPasswordOptions } from './Dto/Send-ResetPassword.dto';
import { SendVerificationEmailOptions } from './Dto/Send-VerificationEmail.dto';
import { SendGenericEmailDto } from './Dto/Send-GenericEmail.dto';
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/Enums/audit-actions.enum';
import { AuditResult } from '../audit/Enums/audit-result.enum';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly auditService: AuditService,
  ) {}

  private sanitizeForTemplate(value: string): string {
    if (!value) return '';
    // Escapar caracteres HTML para prevenir XSS en templates
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#x27;');
  }

  private sanitizeContext(
    context: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeForTemplate(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  async sendVerificationEmail(
    options: SendVerificationEmailOptions,
  ): Promise<void> {
    await this.send({
      to: options.to,
      subject: 'Verificación de cuenta – WasiGo',
      template: 'verification',
      context: {
        alias: this.sanitizeForTemplate(options.alias),
        code: options.code,
        expires: options.expiresInMinutes,
      },
    });
  }

  async sendResetPasswordEmail(
    options: SendResetPasswordOptions,
  ): Promise<void> {
    await this.send({
      to: options.to,
      subject: 'Restablecer contraseña – WasiGo',
      template: 'reset-password',
      context: {
        name: this.sanitizeForTemplate(options.name || 'Usuario'),
        resetUrl: options.resetUrl,
      },
    });
  }

  async sendGenericEmail(options: SendGenericEmailDto): Promise<void> {
    await this.send({
      to: options.to,
      subject: options.subject,
      template: 'generic',
      context: this.sanitizeContext({
        message: options.message,
      }),
    });
  }

  private async send(params: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: params.to,
        subject: params.subject,
        template: params.template,
        context: params.context,
      });

      this.logger.log(`Correo '${params.template}' enviado a ${params.to}`);

      await this.auditService.logEvent({
        action: AuditAction.EMAIL_SENT,
        result: AuditResult.SUCCESS,
        metadata: {
          template: params.template,
          recipient: params.to,
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';

      this.logger.error(
        `Error enviando correo '${params.template}' a ${params.to}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      await this.auditService.logEvent({
        action: AuditAction.EMAIL_FAILED,
        result: AuditResult.FAILED,
        metadata: {
          template: params.template,
          recipient: params.to,
          error: errorMessage,
        },
      });

      throw new InternalServerErrorException(
        'Error al enviar el correo electrónico. Por favor intente más tarde.',
      );
    }
  }
}
