/**
 * Archivo de soporte del modulo.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../types';

/**
 * Decorador para extraer el usuario autenticado del request.
 * Uso: @User() user: JwtPayload
 * También puede extraer propiedades específicas: @User('id') userId: string
 */
export const User = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
