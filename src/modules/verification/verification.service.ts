import { SendVerificationEmailOptions } from './../mail/Dto/Send-VerificationEmail.dto';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { EstadoVerificacionEnum } from '../auth/Enum/estado-ver.enum';
import { BusinessService } from '../business/business.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly businessService: BusinessService,
    private readonly mailService: MailService,
  ) {}

  async sendVerification(userId: string): Promise<void> {
    const user = await this.authService.findForVerification(userId);

    if (user.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO) {
      throw new BadRequestException('Usuario ya verificado');
    }

    const otp = await this.otpService.sendOtp(user.id);

    const displayName = await this.businessService.getDisplayName(user.id);

    const mailOptions: SendVerificationEmailOptions = {
      to: user.email,
      alias: displayName,
      code: otp.code,
      expiresInMinutes: otp.expiresInMinutes,
    };

    await this.mailService.sendVerificationEmail(mailOptions);

    this.logger.log(`Verification email sent to user: ${userId}`);
  }

  async confirmVerification(userId: string, code: string): Promise<void> {
    await this.otpService.validateOtp(userId, code);
    await this.authService.verifyUser(userId);

    this.logger.log(`User verified successfully: ${userId}`);
  }
}
