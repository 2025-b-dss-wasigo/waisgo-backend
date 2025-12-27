import { SetMetadata } from '@nestjs/common';
import { RolUsuarioEnum } from 'src/modules/auth/Enum/users-roles.enum';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RolUsuarioEnum[]) =>
  SetMetadata(ROLES_KEY, roles);
