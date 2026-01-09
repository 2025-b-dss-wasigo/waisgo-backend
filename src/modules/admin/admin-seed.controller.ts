/**
 * Controlador HTTP del modulo admin.
 */

import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Roles, User } from '../common/Decorators';
import { RolUsuarioEnum } from '../auth/Enum';
import { AdminSeedService } from './admin-seed.service';
import type { JwtPayload } from '../common/types';
import { buildAuthContext } from '../common/utils/request-context.util';
import { ErrorMessages } from '../common/constants/error-messages.constant';

@ApiTags('Admin - Seed')
@ApiBearerAuth('access-token')
@Controller('admin/seed')
export class AdminSeedController {
  constructor(
    private readonly seedService: AdminSeedService,
    private readonly configService: ConfigService,
  ) {}

  private assertSeedEnabled(): void {
    const enabled = this.configService.get<boolean>('SEED_ENABLED');
    if (!enabled) {
      throw new NotFoundException(ErrorMessages.SYSTEM.NOT_FOUND);
    }
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 1, ttl: 3600000 } })
  @ApiOperation({ summary: 'Crear datos de prueba en la base de datos' })
  @ApiResponse({ status: 201, description: 'Semilla creada correctamente.' })
  @ApiResponse({ status: 200, description: 'Semilla ya fue ejecutada.' })
  async seed(@User() user: JwtPayload, @Req() req: Request) {
    this.assertSeedEnabled();
    return this.seedService.seedDatabase(user.id, buildAuthContext(req));
  }
}
