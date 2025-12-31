import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';

import { Payout } from '../Models/payout.entity';
import { Payment } from '../Models/payment.entity';
import { PaypalClientService } from '../paypal-client.service';
import { Driver } from '../../drivers/Models/driver.entity';
import { EstadoPayoutEnum, EstadoPagoEnum } from '../Enums';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditResult } from '../../audit/Enums';
import { ErrorMessages } from '../../common/constants/error-messages.constant';
import type { AuthContext } from '../../common/types';
import {
  buildIdWhere,
  generatePublicId,
} from '../../common/utils/public-id.util';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

type PaypalPayoutResponse = {
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
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly paypalClient: PaypalClientService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async getMyPayouts(
    userId: string,
    status?: string,
  ): Promise<{ message: string; data?: Payout[] }> {
    const driver = await this.driverRepository.findOne({
      where: { userId },
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
    userId: string,
    payoutId: string,
  ): Promise<{ message: string; data?: Payout }> {
    const driver = await this.driverRepository.findOne({
      where: { userId },
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
      const paypalResponse = await this.paypalClient.request<PaypalPayoutResponse>(
        {
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
        },
      );

      payout.paypalBatchId =
        paypalResponse.batch_header?.payout_batch_id ?? null;
      payout.attempts += 1;

      if (paypalResponse.batch_header?.batch_status === 'SUCCESS') {
        payout.status = EstadoPayoutEnum.PAID;
        payout.paidAt = new Date();
      }

      await this.payoutRepository.save(payout);

      if (adminUserId) {
        await this.auditService.logEvent({
          action: AuditAction.WITHDRAWAL_COMPLETED,
          userId: adminUserId,
          result: AuditResult.SUCCESS,
          ipAddress: context?.ip,
          userAgent: context?.userAgent,
          metadata: {
            payoutId: payout.id,
            paypalBatchId: payout.paypalBatchId,
          },
        });
      }

      const result = {
        message: ErrorMessages.PAYOUTS.PAYOUT_SENT,
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
