import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { ConfirmOtpDto } from './Dto/confirm-otp.dto';
import { User } from 'src/modules/common/Decorators/user.decorator';
import type { JwtPayload } from 'src/modules/common/types/jwt-payload.type';
import type { AuthContext } from 'src/modules/common/types/auth-context.type';
import { ErrorMessages } from '../common/constants/error-messages.constant';

@ApiTags('Verification')
@Controller('verification')
export class VerificationController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly verificationService: VerificationService) {}

  private async validateUserId(userId: string): Promise<string> {
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  /**
   * Extrae el contexto de autenticación del request
   * para auditoría (IP, User-Agent)
   */
  private getAuthContext(req: Request): AuthContext {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : req.ip || req.socket?.remoteAddress || 'unknown';

    return {
      ip,
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Enviar código de verificación por correo' })
  @ApiResponse({
    status: 200,
    description: 'Código de verificación enviado al correo registrado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Usuario ya verificado.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Límite de reenvíos alcanzado.',
  })
  async send(@User() user: JwtPayload, @Req() req: Request) {
    if (user.isVerified) {
      throw new BadRequestException(
        ErrorMessages.VERIFICATION.ALREADY_VERIFIED,
      );
    }

    const context = this.getAuthContext(req);
    const safeUserId = await this.validateUserId(user.id);
    await this.verificationService.sendVerification(safeUserId, context);

    return {
      success: true,
      message: ErrorMessages.VERIFICATION.CODE_SENT,
    };
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Confirmar código de verificación' })
  @ApiResponse({
    status: 200,
    description:
      'Cuenta verificada exitosamente. El usuario ahora tiene rol PASAJERO.',
  })
  @ApiResponse({
    status: 400,
    description: 'Usuario ya verificado, código incorrecto o expirado.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Demasiados intentos fallidos. OTP bloqueado.',
  })
  async confirm(
    @User() user: JwtPayload,
    @Body() dto: ConfirmOtpDto,
    @Req() req: Request,
  ) {
    if (user.isVerified) {
      throw new BadRequestException(
        ErrorMessages.VERIFICATION.ALREADY_VERIFIED,
      );
    }

    const context = this.getAuthContext(req);
    const safeUserId = await this.validateUserId(user.id);
    await this.verificationService.confirmVerification(
      safeUserId,
      dto.code,
      context,
    );

    return {
      success: true,
      message: ErrorMessages.VERIFICATION.VERIFICATION_SUCCESS,
    };
  }
}
