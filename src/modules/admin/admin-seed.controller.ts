import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles, User } from '../common/Decorators';
import { RolUsuarioEnum } from '../auth/Enum';
import { AdminSeedService } from './admin-seed.service';
import type { JwtPayload } from '../common/types';
import { buildAuthContext } from '../common/utils/request-context.util';

@ApiTags('Admin - Seed')
@ApiBearerAuth('access-token')
@Controller('admin/seed')
export class AdminSeedController {
  constructor(private readonly seedService: AdminSeedService) {}

  @Roles(RolUsuarioEnum.ADMIN)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 1, ttl: 3600000 } })
  @ApiOperation({ summary: 'Crear datos de prueba en la base de datos' })
  @ApiResponse({ status: 201, description: 'Semilla creada correctamente.' })
  @ApiResponse({ status: 200, description: 'Semilla ya fue ejecutada.' })
  async seed(@User() user: JwtPayload, @Req() req: Request) {
    return this.seedService.seedDatabase(user.id, buildAuthContext(req));
  }
}
