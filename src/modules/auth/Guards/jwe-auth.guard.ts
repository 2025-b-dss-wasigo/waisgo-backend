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

@Injectable()
export class JweAuthGuard implements CanActivate {
  private readonly secretKey: Uint8Array;
  private readonly logger = new Logger('JweAuthGuard');

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

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }

    const token = authHeader.slice(7);

    if (token.length > 2000) {
      throw new UnauthorizedException('Token inválido');
    }

    try {
      const { payload } = await jwtDecrypt(token, this.secretKey, {
        issuer: 'wasigo-api',
        audience: 'wasigo-app',
      });

      if (!payload.sub || !payload.jti || !payload.role) {
        throw new UnauthorizedException('Token malformado');
      }

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token expirado');
      }

      if (payload.jti) {
        const isRevoked = await this.redisService.isTokenRevoked(payload.jti);
        if (isRevoked) {
          throw new UnauthorizedException('Token revocado');
        }
      }

      const revocationTimestamp = await this.redisService.get(
        `revoke:user:${payload.sub}`,
      );

      if (revocationTimestamp) {
        if ((payload.iat ?? 0) < Number(revocationTimestamp)) {
          throw new UnauthorizedException(
            'Sesión expirada por cambio de contraseña',
          );
        }
      }

      request.user = {
        id: payload.sub,
        sub: payload.sub,
        role: payload.role,
        isVerified: payload.isVerified,
        alias: payload.alias,
        jti: payload.jti,
        exp: payload.exp,
        iat: payload.iat,
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;

      this.logger.error(`Auth Error: ${error.message}`);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
