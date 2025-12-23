import { SendVerificationEmailOptions } from './Dto/Send-VerificationEmail.dto';
import { SendGenericEmailDto } from './Dto/Send-GenericEmail.dto';
import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST'),
      port: Number(this.configService.get<string>('MAIL_PORT')),
      secure: this.configService.get<string>('MAIL_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('MAIL_USER'),
        pass: this.configService.get<string>('MAIL_PASS'),
      },
    });
  }

  private loadTemplate(templateName: string): string {
    const templatePath = join(__dirname, 'Templates', templateName);
    return readFileSync(templatePath, 'utf8');
  }

  async sendVerificationEmail(
    options: SendVerificationEmailOptions,
  ): Promise<void> {
    const html = this.loadTemplate('verification.html')
      .replace('{{alias}}', options.alias)
      .replace('{{code}}', options.code)
      .replace('{{expires}}', options.expiresInMinutes.toString());

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to: options.to,
        subject: 'Verificación de cuenta – WasiGo',
        html,
      });
    } catch (error) {
      this.logger.error(
        `Error enviando correo de verificación a ${options.to}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Error al enviar el correo de verificación',
      );
    }
  }

  async sendGenericEmail(options: SendGenericEmailDto): Promise<void> {
    const html = this.loadTemplate('generic.html').replace(
      '{{message}}',
      options.message,
    );

    try {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM'),
        to: options.to,
        subject: options.subject,
        html,
      });
    } catch (error) {
      this.logger.error(
        `Error enviando correo genérico a ${options.to}`,
        error.stack,
      );
      throw new InternalServerErrorException('Error al enviar el correo');
    }
  }
}
