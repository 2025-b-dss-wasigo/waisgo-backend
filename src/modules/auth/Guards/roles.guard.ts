import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuarioEnum } from '../Enum';
import { ROLES_KEY } from 'src/modules/common/Decorators';
import type { Request } from 'express';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger('RolesGuard');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RolUsuarioEnum[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user?.role) {
      this.logger.warn(
        'Usuario sin rol identificado intentó acceder a un recurso protegido por roles.',
      );
      throw new ForbiddenException(ErrorMessages.SYSTEM.ROLE_NOT_IDENTIFIED);
    }

    if (!requiredRoles.includes(user.role)) {
      this.logger.warn(
        `Acceso denegado para el rol: ${user.role}. Se requieren roles: ${requiredRoles.join(
          ', ',
        )}`,
      );
      throw new ForbiddenException(ErrorMessages.SYSTEM.ACCESS_DENIED_ROLE);
    }

    const requiresVerifiedRoles =
      !requiredRoles.includes(RolUsuarioEnum.USER);

    if (!user.isVerified && requiresVerifiedRoles) {
      this.logger.warn(
        `Acceso denegado para usuario no verificado con rol: ${user.role}.`,
      );
      throw new ForbiddenException(ErrorMessages.USER.NOT_VERIFIED);
    }

    return true;
  }
}
