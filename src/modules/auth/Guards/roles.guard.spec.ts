/**
 * Pruebas unitarias de auth.
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { RolUsuarioEnum } from '../Enum';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

describe('RolesGuard', () => {
  const buildContext = (user: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as ExecutionContext;

  it('allows access when no roles are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext({}))).toBe(true);
  });

  it('denies access when user has no role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RolUsuarioEnum.PASAJERO]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext(null))).toThrow(
      ForbiddenException,
    );
  });

  it('denies access for unverified users on protected roles', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RolUsuarioEnum.CONDUCTOR]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(
        buildContext({ role: RolUsuarioEnum.CONDUCTOR, isVerified: false }),
      ),
    ).toThrow(ErrorMessages.USER.NOT_VERIFIED);
  });

  it('denies access when role does not match', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RolUsuarioEnum.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(
        buildContext({ role: RolUsuarioEnum.PASAJERO, isVerified: true }),
      ),
    ).toThrow(ErrorMessages.SYSTEM.ACCESS_DENIED_ROLE);
  });

  it('allows access for matching verified role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([RolUsuarioEnum.CONDUCTOR]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(
        buildContext({ role: RolUsuarioEnum.CONDUCTOR, isVerified: true }),
      ),
    ).toBe(true);
  });
});
