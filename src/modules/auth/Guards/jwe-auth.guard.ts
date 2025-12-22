import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtDecrypt } from 'jose';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from 'src/modules/common/Decorators/public.decorator';

@Injectable()
export class JweAuthGuard implements CanActivate {
  private readonly secretKey: Uint8Array;

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
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

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }

    const token = authHeader.slice(7);

    try {
      const { payload } = await jwtDecrypt(token, this.secretKey, {
        issuer: 'wasigo-api',
        audience: 'wasigo-app',
      });

      request.user = {
        id: payload.sub,
        role: payload.role,
        isVerified: payload.isVerified,
        alias: payload.alias,
        jti: payload.jti,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
