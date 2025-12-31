import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import {
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RegisterUserDto,
  UpdatePasswordDto,
} from './Dto';
import { Public, User, Roles } from '../common/Decorators';
import type { JwtPayload } from '../common/types';
import { buildAuthContext } from '../common/utils/request-context.util';
import { RolUsuarioEnum } from './Enum';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly authService: AuthService) {}

  private async validateUserId(userId: string): Promise<string> {
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  /**
   * Extrae el contexto de autenticación del request
   * para auditoría (IP, User-Agent)
   */
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({
    status: 201,
    description:
      'Usuario registrado exitosamente. Se enviará un correo de verificación.',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos inválidos o correo ya registrado.',
  })
  async register(@Body() dto: RegisterUserDto, @Req() req: Request) {
    const context = buildAuthContext(req);
    return this.authService.register(dto, context);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión de usuario' })
  @ApiResponse({
    status: 200,
    description: 'Retorna el token JWT y datos del usuario.',
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos. Bloqueo temporal.',
  })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const context = buildAuthContext(req);
    return this.authService.login(dto, context);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar recuperación de contraseña' })
  @ApiResponse({
    status: 200,
    description: 'Se envía correo si el usuario existe.',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiadas solicitudes. Intente más tarde.',
  })
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 intentos en 5 minutos
  forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    const context = buildAuthContext(req);
    return this.authService.forgotPassword(dto.email, context);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restablecer contraseña con token' })
  @ApiResponse({
    status: 200,
    description: 'Contraseña actualizada correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Token inválido, expirado o contraseña débil.',
  })
  reset(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    const context = buildAuthContext(req);
    return this.authService.resetPassword(dto.token, dto.newPassword, context);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cerrar sesión (Revocar token)' })
  @ApiResponse({ status: 200, description: 'Sesión cerrada correctamente.' })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  logout(@User() user: JwtPayload, @Req() req: Request) {
    const context = buildAuthContext(req);
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = Math.max(0, user.exp - nowInSeconds);

    return this.authService.logout(user.jti, expSeconds, user.id, context);
  }

  @Roles(
    RolUsuarioEnum.PASAJERO,
    RolUsuarioEnum.ADMIN,
    RolUsuarioEnum.CONDUCTOR,
    RolUsuarioEnum.USER,
  )
  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cambiar contraseña del usuario autenticado' })
  @ApiResponse({
    status: 200,
    description:
      'Contraseña actualizada correctamente. Todas las sesiones anteriores serán revocadas.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Contraseña actual incorrecta o la nueva contraseña no cumple los requisitos.',
  })
  @ApiResponse({
    status: 401,
    description: 'Token no proporcionado o inválido.',
  })
  @ApiResponse({
    status: 403,
    description: 'Acceso denegado para su rol.',
  })
  async changePassword(
    @User() user: JwtPayload,
    @Body() dto: UpdatePasswordDto,
    @Req() req: Request,
  ) {
    const context = buildAuthContext(req);
    const safeUserId = await this.validateUserId(user.id);

    return this.authService.changePassword(
      safeUserId,
      dto.currentPassword,
      dto.newPassword,
      context,
    );
  }
}
