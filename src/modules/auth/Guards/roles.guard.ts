import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '../../users/Models/users.entity';
import { ROLES_KEY } from 'src/modules/common/Decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RolUsuario[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: RolUsuario };

    if (!user?.role) {
      throw new ForbiddenException('Rol no identificado');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Rol actual: ${user.role} no autorizado. Se requiere: ${requiredRoles.join(
          ' o ',
        )}.`,
      );
    }

    return true;
  }
}
