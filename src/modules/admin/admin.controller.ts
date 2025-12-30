import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Query,
  Req,
  ParseEnumPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';

import { Roles } from '../common/Decorators/roles.decorator';
import { User } from '../common/Decorators/user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload.type';
import type { AuthContext } from '../common/types/auth-context.type';
import { RolUsuarioEnum } from '../auth/Enum/users-roles.enum';
import { AdminService } from './admin.service';
import { RejectDriverDto } from './Dto/reject-driver.dto';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';

@ApiTags('Admin - Drivers')
@ApiBearerAuth('access-token')
@Controller('admin/drivers')
export class AdminDriversController {
  private readonly uuidPipe = new ParseUUIDPipe({ version: '4' });

  constructor(private readonly adminService: AdminService) {}

  private async validateId(id: string): Promise<string> {
    return this.uuidPipe.transform(id, { type: 'param', data: 'id' });
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

  @Roles(RolUsuarioEnum.ADMIN)
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar solicitudes de conductores' })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: EstadoConductorEnum,
    description: 'Filtrar por estado',
  })
  @ApiResponse({ status: 200, description: 'Listado de conductores' })
  async getAll(
    @Query('estado', new ParseEnumPipe(EstadoConductorEnum, { optional: true }))
    estado?: EstadoConductorEnum,
  ) {
    return this.adminService.getAllDrivers(estado);
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ver detalle de solicitud de conductor' })
  @ApiResponse({ status: 200, description: 'Detalle de la solicitud' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  async getById(@Param('id') id: string) {
    const safeId = await this.validateId(id);
    return this.adminService.getDriverDetail(safeId);
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Patch(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar solicitud de conductor' })
  @ApiResponse({ status: 200, description: 'Conductor aprobado' })
  @ApiResponse({ status: 400, description: 'No se puede aprobar' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  async approve(
    @Param('id') id: string,
    @User() user: JwtPayload,
    @Req() req: Request,
  ) {
    const safeId = await this.validateId(id);
    const context = this.getAuthContext(req);
    return this.adminService.approveDriver(safeId, user.id, context);
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Patch(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar solicitud de conductor' })
  @ApiResponse({ status: 200, description: 'Conductor rechazado' })
  @ApiResponse({ status: 400, description: 'Motivo requerido' })
  @ApiResponse({ status: 404, description: 'Solicitud no encontrada' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectDriverDto,
    @User() user: JwtPayload,
    @Req() req: Request,
  ) {
    const safeId = await this.validateId(id);
    const context = this.getAuthContext(req);
    return this.adminService.rejectDriver(safeId, dto.motivo, user.id, context);
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Patch(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender conductor' })
  @ApiResponse({ status: 200, description: 'Conductor suspendido' })
  @ApiResponse({ status: 400, description: 'No se puede suspender' })
  @ApiResponse({ status: 404, description: 'Conductor no encontrado' })
  async suspend(
    @Param('id') id: string,
    @User() user: JwtPayload,
    @Req() req: Request,
  ) {
    const safeId = await this.validateId(id);
    const context = this.getAuthContext(req);
    return this.adminService.suspendDriver(safeId, user.id, context);
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Patch('documents/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprobar documento de conductor' })
  @ApiResponse({ status: 200, description: 'Documento aprobado' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  async approveDocument(
    @Param('id') id: string,
    @User() user: JwtPayload,
    @Req() req: Request,
  ) {
    const safeId = await this.validateId(id);
    const context = this.getAuthContext(req);
    return this.adminService.approveDocument(safeId, user.id, context);
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Patch('documents/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechazar documento de conductor' })
  @ApiResponse({ status: 200, description: 'Documento rechazado' })
  @ApiResponse({ status: 404, description: 'Documento no encontrado' })
  async rejectDocument(
    @Param('id') id: string,
    @Body() dto: RejectDriverDto,
    @User() user: JwtPayload,
    @Req() req: Request,
  ) {
    const safeId = await this.validateId(id);
    const context = this.getAuthContext(req);
    return this.adminService.rejectDocument(
      safeId,
      dto.motivo,
      user.id,
      context,
    );
  }
}
