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
import { RolUsuarioEnum } from 'src/modules/auth/Enum';
import { Roles, User } from 'src/modules/common/Decorators';
import { PayoutsService } from './payouts.service';
import { GeneratePayoutsDto } from './Dto';
import type { JwtPayload } from 'src/modules/common/types';
import {
  buildAuthContext,
  validateIdentifier,
} from 'src/modules/common/utils/request-context.util';

@ApiTags('Payouts')
@ApiBearerAuth('access-token')
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

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

  /* ========== CONDUCTOR ========== */

  /**
   * Obtener historial de payouts del conductor
   */
  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Get('my')
  @ApiOperation({ summary: 'Obtener historial de payouts como conductor' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtrar por estado',
  })
  @ApiResponse({ status: 200, description: 'Historial de payouts.' })
  async getMyPayouts(
    @User() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    return this.payoutsService.getMyPayouts(user.sub, status);
  }

  /**
   * Obtener detalle de un payout
   */
  @Roles(RolUsuarioEnum.CONDUCTOR)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un payout' })
  @ApiParam({ name: 'id', description: 'ID del payout' })
  @ApiResponse({ status: 200, description: 'Detalle del payout.' })
  @ApiResponse({ status: 404, description: 'Payout no encontrado.' })
  async getPayoutById(
    @User() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const safeId = validateIdentifier(id);
    return this.payoutsService.getPayoutById(user.sub, safeId);
  }

  /* ========== ADMIN ========== */

  /**
   * Generar payouts para un periodo
   * - Suma todos los pagos PAID del periodo
   * - Crea un payout por conductor con fondos pendientes
   * - Agrupa por conductor y periodo (YYYY-MM)
   */
  @Roles(RolUsuarioEnum.ADMIN)
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @ApiOperation({ summary: 'Generar payouts para un periodo' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para generar payouts',
  })
  @ApiResponse({ status: 201, description: 'Payouts generados.' })
  async generatePayouts(
    @User() user: JwtPayload,
    @Body() dto: GeneratePayoutsDto,
    @Req() req: Request,
  ) {
    return this.payoutsService.generatePayouts(
      dto.period,
      user.sub,
      buildAuthContext(req),
      this.getIdempotencyKey(req),
    );
  }

  /**
   * Ejecutar payout por PayPal
   * - Llama a PayPal Payouts API
   * - Actualiza status del payout
   */
  @Roles(RolUsuarioEnum.ADMIN)
  @Post(':id/paypal')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiOperation({ summary: 'Ejecutar payout por PayPal' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para ejecutar payout',
  })
  @ApiParam({ name: 'id', description: 'ID del payout' })
  @ApiResponse({ status: 200, description: 'Payout ejecutado.' })
  @ApiResponse({ status: 400, description: 'Error al ejecutar payout.' })
  async executePaypalPayout(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const safeId = validateIdentifier(id);
    return this.payoutsService.executePaypalPayout(
      safeId,
      user.sub,
      buildAuthContext(req),
      this.getIdempotencyKey(req),
    );
  }

  /**
   * Marcar payout como fallido
   */
  @Roles(RolUsuarioEnum.ADMIN)
  @Patch(':id/fail')
  @ApiOperation({ summary: 'Marcar payout como fallido' })
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Clave idempotente para marcar payout fallido',
  })
  @ApiParam({ name: 'id', description: 'ID del payout' })
  @ApiResponse({ status: 200, description: 'Payout marcado como fallido.' })
  async failPayout(
    @User() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
    @Body('reason') reason?: string,
  ) {
    const safeId = validateIdentifier(id);
    return this.payoutsService.failPayout(
      safeId,
      reason,
      user.sub,
      buildAuthContext(req),
      this.getIdempotencyKey(req),
    );
  }

  /**
   * Listado global de payouts
   */
  @Roles(RolUsuarioEnum.ADMIN)
  @Get()
  @ApiOperation({ summary: 'Listado global de payouts' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiResponse({ status: 200, description: 'Listado global.' })
  async getAllPayouts(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('period') period?: string,
  ) {
    return this.payoutsService.getAllPayouts(page, limit, status, period);
  }
}
