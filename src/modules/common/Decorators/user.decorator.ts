import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../types/jwt-payload.type';

/**
 * Decorador para extraer el usuario autenticado del request.
 * Uso: @User() user: JwtPayload
 * También puede extraer propiedades específicas: @User('id') userId: string
 */
export const User = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    return data ? user?.[data] : user;
  },
);
