/**
 * Servicio de negocio del modulo payments.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';

import { Payout } from '../Models/payout.entity';
import { Payment } from '../Models/payment.entity';
import { PaypalClientService } from '../paypal-client.service';
import { Driver } from '../../drivers/Models/driver.entity';
import { EstadoPayoutEnum, EstadoPagoEnum } from '../Enums';
import { EstadoConductorEnum } from '../../drivers/Enums/estado-conductor.enum';
import { Booking } from '../../bookings/Models/booking.entity';
import { EstadoReservaEnum } from '../../bookings/Enums';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditResult } from '../../audit/Enums';
import { ErrorMessages } from '../../common/constants/error-messages.constant';
import type { AuthContext } from '../../common/types';
import {
  buildIdWhere,
  generatePublicId,
} from '../../common/utils/public-id.util';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { MetricsService } from '../../common/metrics/metrics.service';

type PaypalPayoutResponse = {
  batch_header?: {
    payout_batch_id?: string;
    batch_status?: string;
  };
};

type PaypalPayoutStatusResponse = {
  batch_header?: {
    payout_batch_id?: string;
    batch_status?: string;
  };
};

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout)
    private readonly payoutRepository: Repository<Payout>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly paypalClient: PaypalClientService,
    private readonly idempotencyService: IdempotencyService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  async getDriverBalance(
    businessUserId: string,
  ): Promise<{
    message: string;
    data?: {
      availableForWithdrawal: number;
      monthlyEarnings: number;
      pendingCollection: number;
      completedTrips: number;
    };
  }> {
    const driver = await this.driverRepository.findOne({
      where: { businessUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    if (driver.estado !== EstadoConductorEnum.APROBADO) {
      throw new BadRequestException(ErrorMessages.DRIVER.DRIVER_NOT_APPROVED);
    }

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const availableRaw = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.booking', 'booking')
      .leftJoin('booking.route', 'route')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('route.driverId = :driverId', { driverId: driver.id })
      .andWhere('payment.status = :status', { status: EstadoPagoEnum.PAID })
      .andWhere('payment.payoutId IS NULL')
      .getRawOne<{ total: string }>();

    const monthlyRaw = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.booking', 'booking')
      .leftJoin('booking.route', 'route')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('route.driverId = :driverId', { driverId: driver.id })
      .andWhere('payment.status = :status', { status: EstadoPagoEnum.PAID })
      .andWhere('payment.paidAt >= :start AND payment.paidAt < :end', {
        start: monthStart,
        end: monthEnd,
      })
      .getRawOne<{ total: string }>();

    const pendingRaw = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.booking', 'booking')
      .leftJoin('booking.route', 'route')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('route.driverId = :driverId', { driverId: driver.id })
      .andWhere('payment.status = :status', { status: EstadoPagoEnum.PENDING })
      .getRawOne<{ total: string }>();

    const completedTrips = await this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoin('booking.route', 'route')
      .where('route.driverId = :driverId', { driverId: driver.id })
      .andWhere('booking.estado = :estado', {
        estado: EstadoReservaEnum.COMPLETADA,
      })
      .andWhere('booking.updatedAt >= :start AND booking.updatedAt < :end', {
        start: monthStart,
        end: monthEnd,
      })
      .getCount();

    return {
      message: ErrorMessages.PAYOUTS.PAYOUT_BALANCE,
      data: {
        availableForWithdrawal: Number(availableRaw?.total ?? 0),
        monthlyEarnings: Number(monthlyRaw?.total ?? 0),
        pendingCollection: Number(pendingRaw?.total ?? 0),
        completedTrips,
      },
    };
  }

  async requestPayout(
    businessUserId: string,
    amount: number,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{ message: string; payoutId?: string; amount?: number }> {
    const driver = await this.driverRepository.findOne({
      where: { businessUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    if (driver.estado !== EstadoConductorEnum.APROBADO) {
      throw new BadRequestException(ErrorMessages.DRIVER.DRIVER_NOT_APPROVED);
    }

    const sanitizedAmount = Number(amount ?? 0);
    if (Number.isNaN(sanitizedAmount) || sanitizedAmount <= 0) {
      throw new BadRequestException(
        ErrorMessages.PAYOUTS.PAYOUT_AMOUNT_INVALID,
      );
    }

    if (sanitizedAmount < 5) {
      throw new BadRequestException(
        ErrorMessages.PAYOUTS.PAYOUT_AMOUNT_TOO_LOW,
      );
    }

    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{
        message: string;
        payoutId?: string;
        amount?: number;
      }>(`payouts:request:${driver.id}:${sanitizedAmount}`, driver.id, normalizedKey);
      if (cached) {
        return cached;
      }
    }

    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.booking', 'booking')
      .leftJoinAndSelect('booking.route', 'route')
      .where('route.driverId = :driverId', { driverId: driver.id })
      .andWhere('payment.status = :status', { status: EstadoPagoEnum.PAID })
      .andWhere('payment.payoutId IS NULL')
      .orderBy('payment.paidAt', 'ASC')
      .getMany();

    const availableTotal = payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    if (sanitizedAmount > availableTotal) {
      throw new BadRequestException(
        ErrorMessages.PAYOUTS.PAYOUT_AMOUNT_NOT_AVAILABLE,
      );
    }

    const paymentIds: string[] = [];
    let total = 0;

    for (const payment of payments) {
      const nextTotal = total + Number(payment.amount);
      if (nextTotal > sanitizedAmount) {
        continue;
      }
      paymentIds.push(payment.id);
      total = nextTotal;
      if (total === sanitizedAmount) {
        break;
      }
    }

    if (total < sanitizedAmount || paymentIds.length === 0) {
      throw new BadRequestException(
        ErrorMessages.PAYOUTS.PAYOUT_AMOUNT_NOT_AVAILABLE,
      );
    }

    if (!driver.paypalEmail) {
      throw new BadRequestException(ErrorMessages.DRIVER.INVALID_PAYPAL);
    }

    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}`;

    let payoutId: string | undefined;

    await this.dataSource.transaction(async (manager) => {
      const payoutRepo = manager.getRepository(Payout);
      const payout = payoutRepo.create({
        publicId: await generatePublicId(payoutRepo, 'PYO'),
        driverId: driver.id,
        period,
        amount: Number(total.toFixed(2)),
        status: EstadoPayoutEnum.PENDING,
      });

      const saved = await payoutRepo.save(payout);
      payoutId = saved.publicId;

      await manager.update(Payment, { id: In(paymentIds) }, { payoutId: saved.id });
    });

    await this.auditService.logEvent({
      action: AuditAction.WITHDRAWAL_REQUESTED,
      userId: businessUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { amount: total },
    });
    this.metricsService?.payoutsEventsTotal.labels('requested').inc();

    const response = {
      message: ErrorMessages.PAYOUTS.PAYOUT_REQUESTED,
      payoutId,
      amount: Number(total.toFixed(2)),
    };

    if (normalizedKey) {
      await this.idempotencyService.store(
        `payouts:request:${driver.id}:${sanitizedAmount}`,
        driver.id,
        normalizedKey,
        response,
      );
    }

    return response;
  }

  async getMyPayouts(
    businessUserId: string,
    status?: string,
  ): Promise<{ message: string; data?: Payout[] }> {
    const driver = await this.driverRepository.findOne({
      where: { businessUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    const query = this.payoutRepository
      .createQueryBuilder('payout')
      .where('payout.driverId = :driverId', { driverId: driver.id })
      .orderBy('payout.createdAt', 'DESC');

    if (status) {
      if (
        !Object.values(EstadoPayoutEnum).includes(status as EstadoPayoutEnum)
      ) {
        throw new BadRequestException(
          ErrorMessages.VALIDATION.INVALID_FORMAT('status'),
        );
      }
      query.andWhere('payout.status = :status', { status });
    }

    const payouts = await query.getMany();

    return {
      message: ErrorMessages.PAYOUTS.PAYOUTS_LIST,
      data: payouts,
    };
  }

  async getPayoutById(
    businessUserId: string,
    payoutId: string,
  ): Promise<{ message: string; data?: Payout }> {
    const driver = await this.driverRepository.findOne({
      where: { businessUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    const payout = await this.payoutRepository.findOne({
      where: buildIdWhere<Payout>(payoutId).map((where) => ({
        ...where,
        driverId: driver.id,
      })),
    });

    if (!payout) {
      throw new NotFoundException(ErrorMessages.PAYOUTS.PAYOUT_NOT_FOUND);
    }

    return {
      message: ErrorMessages.PAYOUTS.PAYOUT_DETAIL,
      data: payout,
    };
  }

  async generatePayouts(
    period: string,
    adminUserId?: string,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{ message: string; created?: number }> {
    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    const actorKey = adminUserId ?? 'system';
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{
        message: string;
        created?: number;
      }>(`payouts:generate:${period}`, actorKey, normalizedKey);
      if (cached) {
        return cached;
      }
    }

    const start = new Date(`${period}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(start.getUTCMonth() + 1);

    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.booking', 'booking')
      .leftJoinAndSelect('booking.route', 'route')
      .where('payment.status = :status', { status: EstadoPagoEnum.PAID })
      .andWhere('payment.payoutId IS NULL')
      .andWhere('payment.paidAt >= :start AND payment.paidAt < :end', {
        start,
        end,
      })
      .getMany();

    const grouped = new Map<string, { total: number; paymentIds: string[] }>();

    for (const payment of payments) {
      const driverId = payment.booking?.route?.driverId;
      if (!driverId) continue;

      const current = grouped.get(driverId) || { total: 0, paymentIds: [] };
      current.total += Number(payment.amount);
      current.paymentIds.push(payment.id);
      grouped.set(driverId, current);
    }

    let created = 0;

    await this.dataSource.transaction(async (manager) => {
      const payoutRepo = manager.getRepository(Payout);
      for (const [driverId, group] of grouped.entries()) {
        const payout = payoutRepo.create({
          publicId: await generatePublicId(payoutRepo, 'PYO'),
          driverId,
          period,
          amount: Number(group.total.toFixed(2)),
          status: EstadoPayoutEnum.PENDING,
        });

        const savedPayout = await payoutRepo.save(payout);

        if (group.paymentIds.length > 0) {
          await manager.update(
            Payment,
            { id: In(group.paymentIds) },
            { payoutId: savedPayout.id },
          );
        }

        created += 1;
      }
    });

    if (adminUserId) {
      await this.auditService.logEvent({
        action: AuditAction.WITHDRAWAL_REQUESTED,
        userId: adminUserId,
        result: AuditResult.SUCCESS,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        metadata: { period, created },
      });
    }

    const response = {
      message: ErrorMessages.PAYOUTS.PAYOUTS_GENERATED,
      created,
    };

    if (normalizedKey) {
      await this.idempotencyService.store(
        `payouts:generate:${period}`,
        actorKey,
        normalizedKey,
        response,
      );
    }

    return response;
  }

  async executePaypalPayout(
    payoutId: string,
    adminUserId?: string,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{ message: string; paypalBatchId?: string }> {
    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    const actorKey = adminUserId ?? 'system';
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{
        message: string;
        paypalBatchId?: string;
      }>(`payouts:execute:${payoutId}`, actorKey, normalizedKey);
      if (cached) {
        return cached;
      }
    }

    const payout = await this.payoutRepository.findOne({
      where: buildIdWhere<Payout>(payoutId),
      relations: ['driver'],
    });

    if (!payout) {
      throw new NotFoundException(ErrorMessages.PAYOUTS.PAYOUT_NOT_FOUND);
    }

    if (payout.status !== EstadoPayoutEnum.PENDING) {
      throw new BadRequestException(ErrorMessages.PAYOUTS.PAYOUT_NOT_PENDING);
    }

    if (Number(payout.amount) < 5) {
      throw new BadRequestException(ErrorMessages.PAYMENTS.MIN_WITHDRAWAL);
    }

    if (!payout.driver?.paypalEmail) {
      throw new BadRequestException(
        ErrorMessages.PAYMENTS.INVALID_PAYPAL_ACCOUNT,
      );
    }

    try {
      const paypalResponse =
        await this.paypalClient.request<PaypalPayoutResponse>({
          method: 'POST',
          path: '/v1/payments/payouts',
          body: {
            sender_batch_header: {
              sender_batch_id: `payout-${payout.id}-${Date.now()}`,
              email_subject: 'Tienes un nuevo payout',
            },
            items: [
              {
                recipient_type: 'EMAIL',
                receiver: payout.driver.paypalEmail,
                amount: {
                  value: Number(payout.amount).toFixed(2),
                  currency: 'USD',
                },
                note: 'Payout WasiGo',
                sender_item_id: payout.id,
              },
            ],
          },
        });

      const batchStatus = paypalResponse.batch_header?.batch_status ?? null;
      payout.paypalBatchId =
        paypalResponse.batch_header?.payout_batch_id ?? null;
      payout.attempts += 1;

      if (batchStatus === 'SUCCESS') {
        payout.status = EstadoPayoutEnum.PAID;
        payout.paidAt = new Date();
      } else if (batchStatus === 'FAILED') {
        payout.status = EstadoPayoutEnum.FAILED;
        payout.lastError = 'PayPal batch failed';
      }

      await this.payoutRepository.save(payout);
      if (payout.status === EstadoPayoutEnum.PAID) {
        this.metricsService?.payoutsEventsTotal.labels('paid').inc();
      }
      if (payout.status === EstadoPayoutEnum.FAILED) {
        this.metricsService?.payoutsEventsTotal.labels('failed').inc();
      }

      if (adminUserId && payout.status !== EstadoPayoutEnum.PENDING) {
        const action =
          payout.status === EstadoPayoutEnum.PAID
            ? AuditAction.WITHDRAWAL_COMPLETED
            : AuditAction.WITHDRAWAL_FAILED;
        const result =
          payout.status === EstadoPayoutEnum.PAID
            ? AuditResult.SUCCESS
            : AuditResult.FAILED;
        await this.auditService.logEvent({
          action,
          userId: adminUserId,
          result,
          ipAddress: context?.ip,
          userAgent: context?.userAgent,
          metadata: {
            payoutId: payout.id,
            paypalBatchId: payout.paypalBatchId,
          },
        });
      }

      let message: string = ErrorMessages.PAYOUTS.PAYOUT_PROCESSING;
      if (batchStatus === 'SUCCESS') {
        message = ErrorMessages.PAYOUTS.PAYOUT_SENT;
      } else if (batchStatus === 'FAILED') {
        message = ErrorMessages.PAYOUTS.PAYOUT_FAILED;
      }
      const result = {
        message,
        paypalBatchId: payout.paypalBatchId ?? undefined,
      };

      if (normalizedKey) {
        await this.idempotencyService.store(
          `payouts:execute:${payoutId}`,
          actorKey,
          normalizedKey,
          result,
        );
      }

      return result;
    } catch (error) {
      payout.attempts += 1;
      payout.status = EstadoPayoutEnum.FAILED;
      payout.lastError =
        error instanceof Error ? error.message : 'PayPal payout failed';
      await this.payoutRepository.save(payout);
      this.metricsService?.payoutsEventsTotal.labels('failed').inc();

      if (adminUserId) {
        await this.auditService.logEvent({
          action: AuditAction.WITHDRAWAL_FAILED,
          userId: adminUserId,
          result: AuditResult.FAILED,
          ipAddress: context?.ip,
          userAgent: context?.userAgent,
          metadata: { payoutId: payout.id, error: payout.lastError },
        });
      }

      throw new BadRequestException(ErrorMessages.PAYMENTS.PAYMENT_FAILED);
    }
  }

  @Cron('*/5 * * * *')
  async syncPaypalPayouts(): Promise<void> {
    const pendingPayouts = await this.payoutRepository
      .createQueryBuilder('payout')
      .where('payout.status = :status', { status: EstadoPayoutEnum.PENDING })
      .andWhere('payout.paypalBatchId IS NOT NULL')
      .getMany();

    for (const payout of pendingPayouts) {
      if (!payout.paypalBatchId) {
        continue;
      }

      try {
        const response =
          await this.paypalClient.request<PaypalPayoutStatusResponse>({
            method: 'GET',
            path: `/v1/payments/payouts/${payout.paypalBatchId}`,
          });

        const batchStatus = response.batch_header?.batch_status ?? null;
        if (batchStatus === 'SUCCESS') {
          payout.status = EstadoPayoutEnum.PAID;
          payout.paidAt = new Date();
          payout.lastError = null;
          await this.payoutRepository.save(payout);
          this.metricsService?.payoutsEventsTotal.labels('paid').inc();
        } else if (batchStatus === 'FAILED') {
          payout.status = EstadoPayoutEnum.FAILED;
          payout.lastError = 'PayPal batch failed';
          await this.payoutRepository.save(payout);
          this.metricsService?.payoutsEventsTotal.labels('failed').inc();
        }
      } catch (error) {
        payout.lastError =
          error instanceof Error ? error.message : 'PayPal payout sync failed';
        await this.payoutRepository.save(payout);
      }
    }
  }

  async failPayout(
    payoutId: string,
    reason?: string,
    adminUserId?: string,
    context?: AuthContext,
    idempotencyKey?: string | null,
  ): Promise<{ message: string }> {
    const normalizedKey = this.idempotencyService.normalizeKey(
      idempotencyKey || undefined,
    );
    const actorKey = adminUserId ?? 'system';
    if (normalizedKey) {
      const cached = await this.idempotencyService.get<{ message: string }>(
        `payouts:fail:${payoutId}`,
        actorKey,
        normalizedKey,
      );
      if (cached) {
        return cached;
      }
    }

    const payout = await this.payoutRepository.findOne({
      where: buildIdWhere<Payout>(payoutId),
    });

    if (!payout) {
      throw new NotFoundException(ErrorMessages.PAYOUTS.PAYOUT_NOT_FOUND);
    }

    payout.status = EstadoPayoutEnum.FAILED;
    payout.lastError = reason?.trim() || 'Marked as failed by admin';
    payout.attempts += 1;
    await this.payoutRepository.save(payout);
    this.metricsService?.payoutsEventsTotal.labels('failed').inc();

    if (adminUserId) {
      await this.auditService.logEvent({
        action: AuditAction.WITHDRAWAL_FAILED,
        userId: adminUserId,
        result: AuditResult.FAILED,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        metadata: { payoutId, reason: payout.lastError },
      });
    }

    const response = {
      message: ErrorMessages.PAYOUTS.PAYOUT_FAILED,
    };

    if (normalizedKey) {
      await this.idempotencyService.store(
        `payouts:fail:${payoutId}`,
        actorKey,
        normalizedKey,
        response,
      );
    }

    return response;
  }

  async getAllPayouts(
    page?: number,
    limit?: number,
    status?: string,
    period?: string,
  ): Promise<{ message: string; data?: Payout[]; total?: number }> {
    const pageNumber = page ? Math.max(Number(page), 1) : 1;
    const pageSize = limit ? Math.min(Math.max(Number(limit), 1), 100) : 20;

    const query = this.payoutRepository
      .createQueryBuilder('payout')
      .leftJoinAndSelect('payout.driver', 'driver')
      .orderBy('payout.createdAt', 'DESC')
      .skip((pageNumber - 1) * pageSize)
      .take(pageSize);

    if (status) {
      if (
        !Object.values(EstadoPayoutEnum).includes(status as EstadoPayoutEnum)
      ) {
        throw new BadRequestException(
          ErrorMessages.VALIDATION.INVALID_FORMAT('status'),
        );
      }
      query.andWhere('payout.status = :status', { status });
    }

    if (period) {
      query.andWhere('payout.period = :period', { period });
    }

    const [payouts, total] = await query.getManyAndCount();

    return {
      message: ErrorMessages.PAYOUTS.PAYOUTS_LIST_ADMIN,
      data: payouts,
      total,
    };
  }
}
