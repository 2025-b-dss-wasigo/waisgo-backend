import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
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

import { Roles, User } from '../common/Decorators';
import type { JwtPayload } from '../common/types';
import { buildAuthContext } from '../common/utils/request-context.util';
import { RolUsuarioEnum } from '../auth/Enum';
import { AdminService } from './admin.service';
import { RejectDriverDto } from './Dto';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import { isValidIdentifier } from '../common/utils/public-id.util';

@ApiTags('Admin - Drivers')
@ApiBearerAuth('access-token')
@Controller('admin/drivers')
export class AdminDriversController {
  constructor(private readonly adminService: AdminService) {}

  private validateId(id: string): string {
    if (!isValidIdentifier(id)) {
      throw new BadRequestException(
        ErrorMessages.VALIDATION.INVALID_FORMAT('id'),
      );
    }
    return id;
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
    const safeId = this.validateId(id);
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
    const safeId = this.validateId(id);
    const context = buildAuthContext(req);
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
    const safeId = this.validateId(id);
    const context = buildAuthContext(req);
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
    const safeId = this.validateId(id);
    const context = buildAuthContext(req);
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
    const safeId = this.validateId(id);
    const context = buildAuthContext(req);
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
    const safeId = this.validateId(id);
    const context = buildAuthContext(req);
    return this.adminService.rejectDocument(
      safeId,
      dto.motivo,
      user.id,
      context,
    );
  }
}
