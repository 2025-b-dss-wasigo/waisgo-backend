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
import { IS_PUBLIC_KEY } from 'src/modules/common/Decorators/public.decorator';
import { RedisService } from 'src/redis/redis.service';
import type { Request } from 'express';
import { RolUsuarioEnum } from '../Enum/users-roles.enum';

interface JwtPayloadInternal {
  sub: string;
  role: RolUsuarioEnum;
  isVerified: boolean;
  alias?: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

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

    if (!jwtSecret || jwtSecret.length !== 32) {
      throw new Error(
        'JWT_SECRET debe existir y tener EXACTAMENTE 32 caracteres',
      );
    }

    this.secretKey = new TextEncoder().encode(jwtSecret);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token requerido');
    }

    try {
      const { payload } = await jwtDecrypt(token, this.secretKey, {
        issuer: 'wasigo-api',
        audience: 'wasigo-app',
      });

      const jwtPayload = payload as unknown as JwtPayloadInternal;

      // Validar campos requeridos
      if (!jwtPayload.sub || !jwtPayload.jti || !jwtPayload.role) {
        throw new UnauthorizedException('Token malformado');
      }

      if (jwtPayload.exp && jwtPayload.exp < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token expirado');
      }

      // Verificar si el token ha sido revocado individualmente
      const isRevoked = await this.redisService.isTokenRevoked(jwtPayload.jti);
      if (isRevoked) {
        throw new UnauthorizedException('Token revocado');
      }

      // Verificar si todas las sesiones del usuario han sido revocadas
      const isUserSessionRevoked = await this.redisService.isUserSessionRevoked(
        jwtPayload.sub,
        jwtPayload.iat,
      );
      if (isUserSessionRevoked) {
        throw new UnauthorizedException(
          'Sesión expirada por cambio de contraseña',
        );
      }

      request.user = {
        id: jwtPayload.sub,
        sub: jwtPayload.sub,
        role: jwtPayload.role,
        isVerified: Boolean(jwtPayload.isVerified),
        alias: jwtPayload.alias ?? '',
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
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

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
