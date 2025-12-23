import { SetMetadata } from '@nestjs/common';
import { RolUsuarioEnum } from '../../users/Enums/users-roles.enum';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RolUsuarioEnum[]) =>
  SetMetadata(ROLES_KEY, roles);
