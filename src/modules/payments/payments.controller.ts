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
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { Roles, User } from '../common/Decorators';
import { RolUsuarioEnum } from '../auth/Enum';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, CapturePaypalDto } from './Dto';
import type { JwtPayload } from '../common/types';
import {
  buildAuthContext,
  validateIdentifier,
} from '../common/utils/request-context.util';

@ApiTags('Payments')
@ApiBearerAuth('access-token')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  private getIdempotencyKey(req: Request): string | null {
    const raw = req.headers['idempotency-key'];
    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }
    if (typeof raw === 'string') {
      return raw;
    }
    return null;
  }

  /* ========== PASAJERO ========== */

  /**
   * Crear un pago para una reserva
   * - Si es PayPal/Tarjeta: inicia flujo de pago digital
   * - Si es efectivo: no crea pago, se valida con OTP al subir
   */
  @Roles(RolUsuarioEnum.PASAJERO)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @ApiOperation({ summary: 'Crear pago para una reserva' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para evitar pagos duplicados',
  })
  @ApiResponse({ status: 201, description: 'Pago iniciado.' })
  @ApiResponse({ status: 400, description: 'Reserva inválida o ya pagada.' })
  async createPayment(
    @User() user: JwtPayload,
    @Body() dto: CreatePaymentDto,
    @Req() req: Request,
  ) {
    return this.paymentsService.createPayment(
      user.sub,
      dto,
      buildAuthContext(req),
      this.getIdempotencyKey(req),
    );
  }

  /**
   * Obtener mis pagos como pasajero
   */
  @Roles(RolUsuarioEnum.PASAJERO)
  @Get('my')
  @ApiOperation({ summary: 'Obtener mis pagos como pasajero' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por estado',
  })
  @ApiResponse({ status: 200, description: 'Listado de pagos.' })
  async getMyPayments(
    @User() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.getMyPayments(user.sub, status);
  }

  /* ========== CONDUCTOR ========== */

  /**
   * Obtener pagos recibidos (para el conductor)
   */
  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Get('driver')
  @ApiOperation({ summary: 'Obtener pagos recibidos como conductor' })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, description: 'Pagos recibidos.' })
  async getDriverPayments(
    @User() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.getDriverPayments(user.sub, status);
  }

  /**
   * Obtener detalle de un pago
   */
  @Roles(RolUsuarioEnum.PASAJERO)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un pago' })
  @ApiParam({ name: 'id', description: 'ID del pago' })
  @ApiResponse({ status: 200, description: 'Detalle del pago.' })
  @ApiResponse({ status: 404, description: 'Pago no encontrado.' })
  async getPaymentById(
    @User() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const safeId = validateIdentifier(id);
    return this.paymentsService.getPaymentById(user.sub, safeId);
  }

  /* ========== PAYPAL ========== */

  /**
   * Crear orden de PayPal
   * - Crea orden en PayPal API
   * - Guarda paypalOrderId en el payment
   * - Retorna approvalUrl para el frontend
   */
  @Roles(RolUsuarioEnum.PASAJERO)
  @Post(':id/paypal/create')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiOperation({ summary: 'Crear orden de PayPal' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para crear orden PayPal',
  })
  @ApiParam({ name: 'id', description: 'ID del pago' })
  @ApiResponse({ status: 200, description: 'Orden PayPal creada.' })
  async createPaypalOrder(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.paymentsService.createPaypalOrder(
      user.sub,
      safeId,
      buildAuthContext(req),
      this.getIdempotencyKey(req),
    );
  }

  /**
   * Capturar orden de PayPal (después de aprobación del usuario)
   * - Verifica con PayPal API que el pago fue aprobado
   * - Actualiza status a PAID
   * - ⚠️ SIEMPRE valida con PayPal, NUNCA confiar en el frontend
   */
  @Roles(RolUsuarioEnum.PASAJERO)
  @Post(':id/paypal/capture')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiOperation({ summary: 'Capturar pago de PayPal' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para capturar pago PayPal',
  })
  @ApiParam({ name: 'id', description: 'ID del pago' })
  @ApiResponse({ status: 200, description: 'Pago capturado correctamente.' })
  @ApiResponse({ status: 400, description: 'Pago no aprobado por PayPal.' })
  async capturePaypalOrder(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CapturePaypalDto,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.paymentsService.capturePaypalOrder(
      user.sub,
      safeId,
      dto.paypalOrderId,
      buildAuthContext(req),
      this.getIdempotencyKey(req),
    );
  }

  /* ========== ADMIN ========== */

  /**
   * Listado global de pagos
   */
  @Roles(RolUsuarioEnum.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Listado global de pagos' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, description: 'Listado global.' })
  async getAllPayments(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.getAllPayments(page, limit, status);
  }

  @Roles(RolUsuarioEnum.ADMIN)
  @Patch(':id/reverse')
  @ApiOperation({ summary: 'Revertir un pago' })
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para revertir un pago',
  })
  @ApiParam({ name: 'id', description: 'ID del pago' })
  @ApiResponse({ status: 200, description: 'Pago revertido.' })
  async reversePayment(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.paymentsService.reversePayment(
      safeId,
      user.sub,
      buildAuthContext(req),
      this.getIdempotencyKey(req),
    );
  }
}
