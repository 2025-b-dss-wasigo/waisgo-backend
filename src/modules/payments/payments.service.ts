import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Payment } from './Models/payment.entity';
import { CreatePaymentDto } from './Dto';
import { EstadoPagoEnum, MetodoPagoEnum } from './Enums';
import { PaypalClientService } from './paypal-client.service';
import { Booking } from '../bookings/Models/booking.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { EstadoReservaEnum } from '../bookings/Enums';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import { buildIdWhere, generatePublicId } from '../common/utils/public-id.util';
import { IdempotencyService } from '../common/idempotency/idempotency.service';

type PaypalOrderResponse = {
  id?: string;
  status?: string;
  links?: { rel?: string; href?: string }[];
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
      }>;
    };
  }>;
};

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly paypalClient: PaypalClientService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  private paypalRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    return this.paypalClient.request<T>({
      method,
      path,
      body,
      headers: { Prefer: 'return=representation' },
    });
  }

  private getBookingAmount(booking: Booking): number {
    const routePrice = Number(booking.route?.precioPasajero ?? 0);
    if (!routePrice || routePrice <= 0) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_PRICE_REQUIRED);
    }
    return Number(routePrice.toFixed(2));
  }

  async createPayment(
    passengerId: string,
    dto: CreatePaymentDto,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{ message: string; paymentId?: string }> {
    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{
        message: string;
        paymentId?: string;
      }>('payments:create', passengerId, normalizedKey);
      if (cached) {
        return cached;
      }
    }

    const booking = await this.bookingRepository.findOne({
      where: buildIdWhere<Booking>(dto.bookingId),
      relations: ['route'],
    });

    if (!booking) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    if (booking.passengerId !== passengerId) {
      throw new ForbiddenException(ErrorMessages.SYSTEM.FORBIDDEN);
    }

    if (booking.estado !== EstadoReservaEnum.CONFIRMADA) {
      throw new BadRequestException(ErrorMessages.BOOKINGS.BOOKING_NOT_ACTIVE);
    }

    if (booking.metodoPago !== dto.method) {
      throw new BadRequestException(
        ErrorMessages.PAYMENTS.INVALID_PAYMENT_METHOD,
      );
    }

    const existingPayment = await this.paymentRepository.findOne({
      where: { bookingId: booking.id },
    });

    if (existingPayment) {
      throw new ConflictException(
        ErrorMessages.PAYMENTS.PAYMENT_ALREADY_EXISTS,
      );
    }

    const amount = this.getBookingAmount(booking);

    const payment = this.paymentRepository.create({
      publicId: await generatePublicId(this.paymentRepository, 'PAY'),
      bookingId: booking.id,
      amount,
      currency: 'USD',
      method: dto.method,
      status: EstadoPagoEnum.PENDING,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    await this.auditService.logEvent({
      action: AuditAction.PAYMENT_INITIATED,
      userId: passengerId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: {
        paymentId: savedPayment.id,
        bookingId: booking.id,
        method: dto.method,
        amount,
      },
    });

    const response = {
      message: ErrorMessages.PAYMENTS.PAYMENT_INITIATED,
      paymentId: savedPayment.publicId,
    };

    if (normalizedKey) {
      await this.idempotencyService.store(
        'payments:create',
        passengerId,
        normalizedKey,
        response,
      );
    }

    return response;
  }

  async getMyPayments(
    passengerId: string,
    status?: string,
  ): Promise<{ message: string; data?: Payment[] }> {
    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.booking', 'booking')
      .leftJoinAndSelect('booking.route', 'route')
      .where('booking.passengerId = :passengerId', { passengerId })
      .orderBy('payment.createdAt', 'DESC');

    if (status) {
      if (!Object.values(EstadoPagoEnum).includes(status as EstadoPagoEnum)) {
        throw new BadRequestException(
          ErrorMessages.VALIDATION.INVALID_FORMAT('status'),
        );
      }
      query.andWhere('payment.status = :status', { status });
    }

    const payments = await query.getMany();

    return {
      message: ErrorMessages.PAYMENTS.PAYMENTS_LIST,
      data: payments,
    };
  }

  async getPaymentById(
    passengerId: string,
    paymentId: string,
  ): Promise<{ message: string; data?: Payment }> {
    const payment = await this.paymentRepository.findOne({
      where: buildIdWhere<Payment>(paymentId),
      relations: ['booking', 'booking.route'],
    });

    if (payment?.booking?.passengerId !== passengerId) {
      throw new NotFoundException(ErrorMessages.PAYMENTS.PAYMENT_NOT_FOUND);
    }

    return {
      message: ErrorMessages.PAYMENTS.PAYMENT_DETAIL,
      data: payment,
    };
  }

  async createPaypalOrder(
    passengerId: string,
    paymentId: string,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{
    message: string;
    approvalUrl?: string;
    paypalOrderId?: string;
  }> {
    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{
        message: string;
        approvalUrl?: string;
        paypalOrderId?: string;
      }>(`payments:paypal-order:${paymentId}`, passengerId, normalizedKey);
      if (cached) {
        return cached;
      }
    }

    const payment = await this.paymentRepository.findOne({
      where: buildIdWhere<Payment>(paymentId),
      relations: ['booking'],
    });

    if (payment?.booking?.passengerId !== passengerId) {
      throw new NotFoundException(ErrorMessages.PAYMENTS.PAYMENT_NOT_FOUND);
    }

    if (
      payment.method !== MetodoPagoEnum.PAYPAL &&
      payment.method !== MetodoPagoEnum.TARJETA
    ) {
      throw new BadRequestException(
        ErrorMessages.PAYMENTS.INVALID_PAYMENT_METHOD,
      );
    }

    if (payment.status !== EstadoPagoEnum.PENDING) {
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_NOT_PENDING);
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    const order = await this.paypalRequest<PaypalOrderResponse>(
      'POST',
      '/v2/checkout/orders',
      {
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: payment.currency,
              value: Number(payment.amount).toFixed(2),
            },
          },
        ],
        application_context: {
          return_url: `${frontendUrl}/payments/success`,
          cancel_url: `${frontendUrl}/payments/cancel`,
          user_action: 'PAY_NOW',
        },
      },
    );

    const approvalUrl = order.links?.find(
      (link) => link.rel === 'approve',
    )?.href;

    if (!order.id || !approvalUrl) {
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }

    payment.paypalOrderId = order.id;
    await this.paymentRepository.save(payment);

    await this.auditService.logEvent({
      action: AuditAction.PAYMENT_INITIATED,
      userId: passengerId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { paymentId: payment.id, paypalOrderId: order.id },
    });

    const response = {
      message: ErrorMessages.PAYMENTS.PAYPAL_ORDER_CREATED,
      approvalUrl,
      paypalOrderId: order.id,
    };

    if (normalizedKey) {
      await this.idempotencyService.store(
        `payments:paypal-order:${paymentId}`,
        passengerId,
        normalizedKey,
        response,
      );
    }

    return response;
  }

  async capturePaypalOrder(
    passengerId: string,
    paymentId: string,
    paypalOrderId: string,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{ message: string }> {
    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{ message: string }>(
        `payments:paypal-capture:${paymentId}`,
        passengerId,
        normalizedKey,
      );
      if (cached) {
        return cached;
      }
    }

    const payment = await this.paymentRepository.findOne({
      where: buildIdWhere<Payment>(paymentId),
      relations: ['booking'],
    });

    if (payment?.booking?.passengerId !== passengerId) {
      throw new NotFoundException(ErrorMessages.SYSTEM.NOT_FOUND);
    }

    if (
      payment.method !== MetodoPagoEnum.PAYPAL &&
      payment.method !== MetodoPagoEnum.TARJETA
    ) {
      throw new BadRequestException(
        ErrorMessages.PAYMENTS.INVALID_PAYMENT_METHOD,
      );
    }

    if (!payment.paypalOrderId || payment.paypalOrderId !== paypalOrderId) {
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }

    const capture = await this.paypalRequest<PaypalOrderResponse>(
      'POST',
      `/v2/checkout/orders/${paypalOrderId}/capture`,
    );

    if (capture.status !== 'COMPLETED') {
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }

    const captureId =
      capture.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null;

    payment.status = EstadoPagoEnum.PAID;
    payment.paidAt = new Date();
    payment.paypalCaptureId = captureId;
    await this.paymentRepository.save(payment);

    await this.auditService.logEvent({
      action: AuditAction.PAYMENT_COMPLETED,
      userId: passengerId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: {
        paymentId: payment.id,
        paypalOrderId,
        paypalCaptureId: captureId,
      },
    });

    const response = {
      message: ErrorMessages.PAYMENTS.PAYPAL_CAPTURED,
    };

    if (normalizedKey) {
      await this.idempotencyService.store(
        `payments:paypal-capture:${paymentId}`,
        passengerId,
        normalizedKey,
        response,
      );
    }

    return response;
  }

  async getDriverPayments(
    driverUserId: string,
    status?: string,
  ): Promise<{ message: string; data?: Payment[] }> {
    const driver = await this.driverRepository.findOne({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.booking', 'booking')
      .leftJoinAndSelect('booking.route', 'route')
      .where('route.driverId = :driverId', { driverId: driver.id })
      .orderBy('payment.createdAt', 'DESC');

    if (status) {
      if (!Object.values(EstadoPagoEnum).includes(status as EstadoPagoEnum)) {
        throw new BadRequestException(
          ErrorMessages.VALIDATION.INVALID_FORMAT('status'),
        );
      }
      query.andWhere('payment.status = :status', { status });
    }

    const payments = await query.getMany();

    return {
      message: ErrorMessages.PAYMENTS.DRIVER_PAYMENTS_LIST,
      data: payments,
    };
  }

  async getAllPayments(
    page?: number,
    limit?: number,
    status?: string,
  ): Promise<{ message: string; data?: Payment[]; total?: number }> {
    const pageNumber = page ? Math.max(Number(page), 1) : 1;
    const pageSize = limit ? Math.min(Math.max(Number(limit), 1), 100) : 20;

    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.booking', 'booking')
      .leftJoinAndSelect('booking.route', 'route')
      .orderBy('payment.createdAt', 'DESC')
      .skip((pageNumber - 1) * pageSize)
      .take(pageSize);

    if (status) {
      if (!Object.values(EstadoPagoEnum).includes(status as EstadoPagoEnum)) {
        throw new BadRequestException(
          ErrorMessages.VALIDATION.INVALID_FORMAT('status'),
        );
      }
      query.andWhere('payment.status = :status', { status });
    }

    const [payments, total] = await query.getManyAndCount();

    return {
      message: ErrorMessages.PAYMENTS.PAYMENTS_LIST_ADMIN,
      data: payments,
      total,
    };
  }

  private async refundPaypalCapture(captureId: string): Promise<void> {
    await this.paypalRequest(
      'POST',
      `/v2/payments/captures/${captureId}/refund`,
      {},
    );
  }

  async reversePayment(
    paymentId: string,
    actorUserId?: string,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{ message: string }> {
    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    const actorKey = actorUserId ?? 'system';
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{ message: string }>(
        `payments:reverse:${paymentId}`,
        actorKey,
        normalizedKey,
      );
      if (cached) {
        return cached;
      }
    }

    const payment = await this.paymentRepository.findOne({
      where: buildIdWhere<Payment>(paymentId),
    });

    if (!payment) {
      throw new NotFoundException(ErrorMessages.PAYMENTS.PAYMENT_NOT_FOUND);
    }

    if (payment.status !== EstadoPagoEnum.PAID) {
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_NOT_PAID);
    }

    try {
      if (
        (payment.method === MetodoPagoEnum.PAYPAL ||
          payment.method === MetodoPagoEnum.TARJETA) &&
        payment.paypalCaptureId
      ) {
        await this.refundPaypalCapture(payment.paypalCaptureId);
      }
    } catch (error) {
      payment.status = EstadoPagoEnum.FAILED;
      payment.failureReason =
        error instanceof Error ? error.message : 'PayPal refund failed';
      await this.paymentRepository.save(payment);
      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }

    payment.status = EstadoPagoEnum.REVERSED;
    payment.reversedAt = new Date();
    await this.paymentRepository.save(payment);

    await this.auditService.logEvent({
      action: AuditAction.PAYMENT_REFUNDED,
      userId: actorUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { paymentId: payment.id, method: payment.method },
    });

    const response = {
      message: ErrorMessages.PAYMENTS.PAYMENT_REVERSED,
    };

    if (normalizedKey) {
      await this.idempotencyService.store(
        `payments:reverse:${paymentId}`,
        actorKey,
        normalizedKey,
        response,
      );
    }

    return response;
  }
}
