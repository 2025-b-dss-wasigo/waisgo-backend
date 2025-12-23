import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { VerificationService } from './verification.service';
import { ConfirmOtpDto } from './Dto/confirm-otp.dto';
import { User } from 'src/modules/common/Decorators/user.decorator';
import type { JwtPayload } from 'src/modules/common/types/jwt-payload.type';

@Controller('verification')
export class VerificationController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly verificationService: VerificationService) {}

  private async validateUserId(userId: string): Promise<string> {
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@User() user: JwtPayload) {
    if (user.isVerified) {
      throw new BadRequestException('Usuario ya verificado');
    }

    const safeUserId = await this.validateUserId(user.id);
    await this.verificationService.sendVerification(safeUserId);

    return {
      success: true,
      message: 'Código de verificación enviado al correo',
    };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@User() user: JwtPayload, @Body() dto: ConfirmOtpDto) {
    if (user.isVerified) {
      throw new BadRequestException('Usuario ya verificado');
    }

    const safeUserId = await this.validateUserId(user.id);
    await this.verificationService.confirmVerification(safeUserId, dto.code);

    return {
      success: true,
      message: 'Cuenta verificada exitosamente',
    };
  }
}
