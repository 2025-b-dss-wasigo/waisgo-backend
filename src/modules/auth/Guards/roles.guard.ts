import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '../../users/Models/users.entity';
import { ROLES_KEY } from 'src/modules/common/Decorators/roles.decorator';
import { AuditService } from 'src/modules/audit/audit.service';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger('RolesGuard');

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
      this.logger.warn(
        'Usuario sin rol identificado intentó acceder a un recurso protegido por roles.',
      );
      throw new ForbiddenException('Rol no identificado');
    }

    if (!requiredRoles.includes(user.role)) {
      this.logger.warn(
        `Acceso denegado para el rol: ${user.role}. Se requieren roles: ${requiredRoles.join(
          ', ',
        )}`,
      );
      throw new ForbiddenException('Acceso denegado para su rol');
    }

    return true;
  }
}
