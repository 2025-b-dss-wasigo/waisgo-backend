import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';

import { Roles } from '../common/Decorators/roles.decorator';
import { User } from '../common/Decorators/user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import type { AuthContext } from '../common/types/auth-context.type';
import { RolUsuarioEnum } from '../auth/Enum/users-roles.enum';
import { VehicleService } from './vehicle.service';
import { CreateVehicleDto } from './Dto/create-vehicle.dto';
import { UpdateVehicleDto } from './Dto/update-vehicle.dto';

@ApiTags('Vehicles')
@ApiBearerAuth('access-token')
@Controller('vehicles')
export class VehiclesController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly vehicleService: VehicleService) {}

  private async validateUserId(userId: string): Promise<string> {
    return this.uuidPipe.transform(userId, { type: 'custom' });
  }

  private async validateVehicleId(vehicleId: string): Promise<string> {
    return this.uuidPipe.transform(vehicleId, { type: 'param', data: 'id' });
  }

  private getAuthContext(req: Request): AuthContext {
    const forwardedFor = req.headers['x-forwarded-for'];
    const ip =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : req.ip || req.socket?.remoteAddress || 'unknown';

    return {
      ip,
      userAgent: req.headers['user-agent'] || 'unknown',
    };
  }

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar vehículo' })
  @ApiResponse({
    status: 201,
    description: 'Vehículo registrado correctamente',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 403, description: 'No eres conductor aprobado' })
  @ApiResponse({ status: 409, description: 'La placa ya está registrada' })
  async create(
    @User() user: JwtPayload,
    @Body() dto: CreateVehicleDto,
    @Req() req: Request,
  ) {
    const safeUserId = await this.validateUserId(user.id);
    const context = this.getAuthContext(req);
    return this.vehicleService.create(safeUserId, dto, context);
  }

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obtener mis vehículos' })
  @ApiResponse({ status: 200, description: 'Lista de vehículos' })
  async getMine(@User() user: JwtPayload) {
    const safeUserId = await this.validateUserId(user.id);
    return this.vehicleService.getMyVehicles(safeUserId);
  }

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar vehículo' })
  @ApiResponse({ status: 200, description: 'Vehículo actualizado' })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado' })
  async update(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDto,
    @Req() req: Request,
  ) {
    const safeUserId = await this.validateUserId(user.id);
    const safeVehicleId = await this.validateVehicleId(id);
    const context = this.getAuthContext(req);
    return this.vehicleService.update(safeUserId, safeVehicleId, dto, context);
  }

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Patch(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar vehículo' })
  @ApiResponse({ status: 200, description: 'Vehículo desactivado' })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado' })
  async disable(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeUserId = await this.validateUserId(user.id);
    const safeVehicleId = await this.validateVehicleId(id);
    const context = this.getAuthContext(req);
    return this.vehicleService.disable(safeUserId, safeVehicleId, context);
  }

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Patch(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivar vehículo (máximo 30 días después de desactivar)',
  })
  @ApiResponse({ status: 200, description: 'Vehículo reactivado' })
  @ApiResponse({
    status: 400,
    description: 'Ya está activo o pasaron más de 30 días',
  })
  @ApiResponse({ status: 404, description: 'Vehículo no encontrado' })
  async reactivate(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeUserId = await this.validateUserId(user.id);
    const safeVehicleId = await this.validateVehicleId(id);
    const context = this.getAuthContext(req);
    return this.vehicleService.reactivate(safeUserId, safeVehicleId, context);
  }
}
