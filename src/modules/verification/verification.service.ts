import { SendVerificationEmailOptions } from './../mail/Dto/Send-VerificationEmail.dto';
import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { OtpService } from '../otp/otp.service';
import { MailService } from '../mail/mail.service';
import { RolUsuarioEnum } from '../users/Enums/users-roles.enum';
import { EstadoVerificacionEnum } from '../users/Enums/estado-ver.enum';

@Injectable()
export class VerificationService {
  constructor(
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  async sendVerification(userId: string): Promise<void> {
    const user = await this.usersService.findByIdForVerification(userId);

    if (user.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO) {
      throw new BadRequestException('Usuario ya verificado');
    }

    const otp = await this.otpService.sendOtp(user.id);

    const mailOptions: SendVerificationEmailOptions = {
      to: user.email,
      alias: user.alias,
      code: otp.code,
      expiresInMinutes: otp.expiresInMinutes,
    };

    await this.mailService.sendVerificationEmail(mailOptions);
  }

  async confirmVerification(userId: string, code: string): Promise<void> {
    await this.otpService.validateOtp(userId, code);

    await this.usersService.update(userId, {
      estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
      rol: RolUsuarioEnum.PASAJERO,
    });
  }
}
