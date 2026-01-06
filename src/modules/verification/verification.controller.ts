import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
  Req,
  Param,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { ConfirmOtpDto } from './Dto';
import { User } from 'src/modules/common/Decorators/user.decorator';
import type { JwtPayload } from 'src/modules/common/types/jwt-payload.type';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import { buildAuthContext } from '../common/utils/request-context.util';
import { Roles } from '../common/Decorators/roles.decorator';
import { RolUsuarioEnum } from '../auth/Enum';
import { Public } from '../common/Decorators/public.decorator';

@ApiTags('Verification')
@Controller('verification')
export class VerificationController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly verificationService: VerificationService) {}

  private async validateUserId(userId: string): Promise<string> {
    // Si es un publicId (formato USR_XXXX), devolverlo tal cual
    if (userId.startsWith('USR_')) {
      return userId;
    }
    // Si es un UUID, validarlo
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  /**
   * Enviar código de verificación sin autenticación (para después del registro)
   * POST /verification/send/:userId
   */
  @Public()
  @Post('send/:userId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @ApiOperation({ summary: 'Enviar código de verificación por correo (sin autenticación)' })
  @ApiResponse({
    status: 200,
    description: 'Código de verificación enviado al correo registrado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Usuario ya verificado o no encontrado.',
  })
  @ApiResponse({
    status: 403,
    description: 'Límite de reenvíos alcanzado.',
  })
  async sendPublic(@Param('userId') userId: string, @Req() req: Request) {
    const safeUserId = await this.validateUserId(userId);
    const context = buildAuthContext(req);
    await this.verificationService.sendVerification(safeUserId, context);

    return {
      success: true,
      message: ErrorMessages.VERIFICATION.CODE_SENT,
    };
  }

  /**
   * Extrae el contexto de autenticación del request
   * para auditoría (IP, User-Agent)
   */
  @Roles(RolUsuarioEnum.USER)
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 600000 } })
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

    const context = buildAuthContext(req);
    const safeUserId = await this.validateUserId(user.id);
    await this.verificationService.sendVerification(safeUserId, context);

    return {
      success: true,
      message: ErrorMessages.VERIFICATION.CODE_SENT,
    };
  }

  @Roles(RolUsuarioEnum.USER)
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
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

    const context = buildAuthContext(req);
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

  /**
   * Confirmar código OTP sin autenticación (para después del registro)
   * POST /verification/confirm/:userId
   */
  @Public()
  @Post('confirm/:userId')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiOperation({ summary: 'Confirmar código de verificación (sin autenticación)' })
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
    status: 403,
    description: 'Demasiados intentos fallidos. OTP bloqueado.',
  })
  async confirmPublic(
    @Param('userId') userId: string,
    @Body() dto: ConfirmOtpDto,
    @Req() req: Request,
  ) {
    const safeUserId = await this.validateUserId(userId);
    const context = buildAuthContext(req);
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
