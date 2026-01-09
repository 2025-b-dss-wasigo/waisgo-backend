/**
 * Guardia de seguridad para control de acceso.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtDecrypt } from 'jose';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/modules/common/Decorators';
import { RedisService } from 'src/redis/redis.service';
import type { Request } from 'express';
import { RolUsuarioEnum } from '../Enum';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

interface JwtPayloadInternal {
  sub: string;
  role: RolUsuarioEnum;
  isVerified: boolean;
  alias?: string;
  publicId?: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * Guardia de autenticacion basada en JWE.
 * @security Valida issuer/audience, exp y revocacion en Redis.
 */
@Injectable()
export class JweAuthGuard implements CanActivate {
  private readonly secretKey: Uint8Array;
  private readonly logger = new Logger(JweAuthGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');

    if (jwtSecret?.length !== 32) {
      throw new Error(
        'JWT_SECRET debe existir y tener EXACTAMENTE 32 caracteres',
      );
    }

    this.secretKey = new TextEncoder().encode(jwtSecret);
  }

  /**
   * Valida el token JWE y construye el contexto de usuario.
   * @security Verifica issuer/audience, exp y revocacion en Redis.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException(ErrorMessages.SYSTEM.TOKEN_REQUIRED);
    }

    try {
      const { payload } = await jwtDecrypt(token, this.secretKey, {
        issuer: 'wasigo-api',
        audience: 'wasigo-app',
      });

      const jwtPayload = payload as unknown as JwtPayloadInternal;

      // Validar campos requeridos
      if (!jwtPayload.sub || !jwtPayload.jti || !jwtPayload.role) {
        throw new UnauthorizedException(ErrorMessages.SYSTEM.TOKEN_MALFORMED);
      }

      if (jwtPayload.exp && jwtPayload.exp < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException(ErrorMessages.SYSTEM.TOKEN_EXPIRED);
      }

      // Verificar si el token ha sido revocado individualmente
      const isRevoked = await this.redisService.isTokenRevoked(jwtPayload.jti);
      if (isRevoked) {
        throw new UnauthorizedException(ErrorMessages.SYSTEM.TOKEN_REVOKED);
      }

      // Verificar si todas las sesiones del usuario han sido revocadas
      const isUserSessionRevoked = await this.redisService.isUserSessionRevoked(
        jwtPayload.sub,
        jwtPayload.iat,
      );
      if (isUserSessionRevoked) {
        throw new UnauthorizedException(ErrorMessages.SYSTEM.SESSION_EXPIRED);
      }

      // El sub ahora es businessUserId, desacoplado de authUserId
      request.user = {
        id: jwtPayload.sub,
        sub: jwtPayload.sub,
        role: jwtPayload.role,
        isVerified: Boolean(jwtPayload.isVerified),
        alias: jwtPayload.alias ?? '',
        publicId: jwtPayload.publicId ?? '',
        jti: jwtPayload.jti,
        exp: jwtPayload.exp,
        iat: jwtPayload.iat,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      this.logger.warn(
        `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new UnauthorizedException(ErrorMessages.SYSTEM.INVALID_TOKEN);
    }
  }

  /**
   * Extrae el token desde el header Authorization.
   * @security Valida formato y longitud para reducir abuso.
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return undefined;
    }

    // Validación de longitud máxima
    if (token.length > 2000) {
      return undefined;
    }

    // Validación básica del formato del token JWE (5 partes separadas por puntos)
    const parts = token.split('.');
    if (parts.length !== 5) {
      return undefined;
    }

    return token;
  }
}
