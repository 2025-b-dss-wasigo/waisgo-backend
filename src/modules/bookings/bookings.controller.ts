import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Roles, User } from '../common/Decorators';
import { RolUsuarioEnum } from '../auth/Enum';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, VerifyOtpDto } from './Dto';
import type { JwtPayload } from '../common/types';
import {
  buildAuthContext,
  validateIdentifier,
} from '../common/utils/request-context.util';

@ApiTags('Bookings')
@ApiBearerAuth('access-token')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /* ================= PASAJERO ================= */

  @Roles(RolUsuarioEnum.PASAJERO)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear reserva en una ruta' })
  @ApiResponse({ status: 201, description: 'Reserva creada y confirmada.' })
  @ApiResponse({ status: 400, description: 'Pasajero bloqueado o ruta llena.' })
  @ApiResponse({ status: 404, description: 'Ruta no encontrada.' })
  async createBooking(
    @User() user: JwtPayload,
    @Body() dto: CreateBookingDto,
    @Req() req: Request,
  ) {
    return this.bookingsService.createBooking(
      user.sub,
      dto,
      buildAuthContext(req),
    );
  }

  @Roles(RolUsuarioEnum.PASAJERO)
  @Get('my')
  @ApiOperation({ summary: 'Obtener mis reservas como pasajero' })
  @ApiResponse({ status: 200, description: 'Listado de reservas.' })
  async getMyBookings(
    @User() user: JwtPayload,
    @Query('estado') estado?: string,
  ) {
    return this.bookingsService.getMyBookings(user.sub, estado);
  }

  @Roles(RolUsuarioEnum.PASAJERO)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una reserva' })
  @ApiParam({ name: 'id', description: 'ID de la reserva' })
  @ApiResponse({ status: 200, description: 'Detalle de la reserva.' })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada.' })
  async getBookingById(
    @User() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const safeId = validateIdentifier(id);
    return this.bookingsService.getBookingById(user.sub, safeId);
  }

  @Roles(RolUsuarioEnum.PASAJERO)
  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar una reserva' })
  @ApiParam({ name: 'id', description: 'ID de la reserva' })
  @ApiResponse({ status: 200, description: 'Reserva cancelada.' })
  @ApiResponse({ status: 400, description: 'No se puede cancelar.' })
  async cancelBooking(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.bookingsService.cancelBooking(
      user.sub,
      safeId,
      buildAuthContext(req),
    );
  }

  @Roles(RolUsuarioEnum.PASAJERO)
  @Get(':id/map')
  @ApiOperation({ summary: 'Obtener coordenadas del mapa de la ruta' })
  @ApiParam({ name: 'id', description: 'ID de la reserva' })
  @ApiResponse({ status: 200, description: 'Coordenadas de la ruta.' })
  @ApiResponse({ status: 403, description: 'Reserva no activa, sin acceso.' })
  async getBookingMap(
    @User() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const safeId = validateIdentifier(id);
    return this.bookingsService.getBookingMap(user.sub, safeId);
  }

  /* ================= CONDUCTOR ================= */

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Get('route/:routeId')
  @ApiOperation({ summary: 'Obtener pasajeros confirmados de una ruta' })
  @ApiParam({ name: 'routeId', description: 'ID de la ruta' })
  @ApiResponse({ status: 200, description: 'Listado de pasajeros.' })
  async getBookingsByRoute(
    @User() user: JwtPayload,
    @Param('routeId') routeId: string,
  ) {
    const safeRouteId = validateIdentifier(routeId, 'routeId');
    return this.bookingsService.getBookingsByRoute(user.sub, safeRouteId);
  }

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Patch(':id/complete')
  @ApiOperation({ summary: 'Marcar pasajero como llegado a destino' })
  @ApiParam({ name: 'id', description: 'ID de la reserva' })
  @ApiResponse({ status: 200, description: 'Pasajero marcado como llegado.' })
  async completeBooking(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.bookingsService.completeBooking(
      user.sub,
      safeId,
      buildAuthContext(req),
    );
  }

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Patch(':id/no-show')
  @ApiOperation({ summary: 'Marcar pasajero como NO_SHOW' })
  @ApiParam({ name: 'id', description: 'ID de la reserva' })
  @ApiResponse({ status: 200, description: 'Pasajero marcado como NO_SHOW.' })
  @ApiResponse({ status: 400, description: 'Aun no han pasado 30 minutos.' })
  async markNoShow(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.bookingsService.markNoShow(
      user.sub,
      safeId,
      buildAuthContext(req),
    );
  }

  /* ================= VALIDACION OTP ================= */

  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Post(':id/verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 6, ttl: 300000 } })
  @ApiOperation({ summary: 'Verificar OTP del pasajero' })
  @ApiParam({ name: 'id', description: 'ID de la reserva' })
  @ApiResponse({ status: 200, description: 'OTP validado correctamente.' })
  @ApiResponse({ status: 400, description: 'OTP invalido o ya usado.' })
  async verifyOtp(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.bookingsService.verifyOtp(
      user.sub,
      safeId,
      dto.otp,
      buildAuthContext(req),
    );
  }
}
