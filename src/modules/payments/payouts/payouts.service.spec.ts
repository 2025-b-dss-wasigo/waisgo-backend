/**
 * Pruebas unitarias de payments.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { EstadoPayoutEnum } from '../Enums';
import { ErrorMessages } from '../../common/constants/error-messages.constant';
import { AuditAction, AuditResult } from '../../audit/Enums';
import * as publicIdUtil from '../../common/utils/public-id.util';

describe('PayoutsService', () => {
  const payoutRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const paymentRepository = {
    createQueryBuilder: jest.fn(),
  };
  const driverRepository = {
    findOne: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };
  const paypalClient = {
    request: jest.fn(),
  };
  const idempotencyService = {
    normalizeKey: jest.fn(),
    get: jest.fn(),
    store: jest.fn(),
  };

  const buildQuery = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
  });

  let service: PayoutsService;

  beforeEach(() => {
    jest.clearAllMocks();
    idempotencyService.normalizeKey.mockReturnValue(null);
    service = new PayoutsService(
      payoutRepository as never,
      paymentRepository as never,
      driverRepository as never,
      dataSource as never,
      auditService as never,
      paypalClient as never,
      idempotencyService as never,
    );
  });

  it('throws when driver is missing on getMyPayouts', async () => {
    driverRepository.findOne.mockResolvedValue(null);

    await expect(service.getMyPayouts('user-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects invalid status on getMyPayouts', async () => {
    driverRepository.findOne.mockResolvedValue({ id: 'driver-id' });
    payoutRepository.createQueryBuilder.mockReturnValue(buildQuery());

    await expect(service.getMyPayouts('user-id', 'INVALID')).rejects.toThrow(
      ErrorMessages.VALIDATION.INVALID_FORMAT('status'),
    );
  });

  it('returns payouts for driver', async () => {
    driverRepository.findOne.mockResolvedValue({ id: 'driver-id' });
    const query = buildQuery();
    query.getMany.mockResolvedValue([{ id: 'payout-1' }]);
    payoutRepository.createQueryBuilder.mockReturnValue(query);

    const response = await service.getMyPayouts(
      'user-id',
      EstadoPayoutEnum.PENDING,
    );

    expect(response).toEqual({
      message: ErrorMessages.PAYOUTS.PAYOUTS_LIST,
      data: [{ id: 'payout-1' }],
    });
  });

  it('returns cached response when idempotency hits on generatePayouts', async () => {
    idempotencyService.normalizeKey.mockReturnValue('key');
    idempotencyService.get.mockResolvedValue({
      message: 'cached',
      created: 2,
    });

    const response = await service.generatePayouts(
      '2025-01',
      'admin',
      undefined,
      'raw-key',
    );

    expect(response).toEqual({ message: 'cached', created: 2 });
    expect(paymentRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('generates payouts and groups payments by driver', async () => {
    const paymentsQuery = buildQuery();
    paymentsQuery.getMany.mockResolvedValue([
      {
        id: 'pay-1',
        amount: 10,
        booking: { route: { driverId: 'driver-1' } },
      },
      {
        id: 'pay-2',
        amount: 5,
        booking: { route: { driverId: 'driver-1' } },
      },
      {
        id: 'pay-3',
        amount: 7,
        booking: { route: { driverId: 'driver-2' } },
      },
      {
        id: 'pay-4',
        amount: 9,
        booking: { route: {} },
      },
    ]);
    paymentRepository.createQueryBuilder.mockReturnValue(paymentsQuery);

    const payoutRepo = {
      create: jest.fn().mockImplementation((input) => ({ ...input })),
      save: jest.fn().mockImplementation(async (input) => ({
        ...input,
        id: `payout-${input.driverId}`,
      })),
    };
    const update = jest.fn();
    dataSource.transaction.mockImplementation(async (work) =>
      work({
        getRepository: jest.fn(() => payoutRepo),
        update,
      } as never),
    );

    const idSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('PYO_123');

    const response = await service.generatePayouts('2025-01', 'admin-id', {
      ip: '127.0.0.1',
      userAgent: 'jest',
    });

    expect(response).toEqual({
      message: ErrorMessages.PAYOUTS.PAYOUTS_GENERATED,
      created: 2,
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.WITHDRAWAL_REQUESTED,
        result: AuditResult.SUCCESS,
      }),
    );

    idSpy.mockRestore();
  });

  it('returns cached response on executePaypalPayout', async () => {
    idempotencyService.normalizeKey.mockReturnValue('key');
    idempotencyService.get.mockResolvedValue({
      message: 'cached',
      paypalBatchId: 'batch-1',
    });

    const response = await service.executePaypalPayout(
      'PYO_123',
      'admin-id',
      undefined,
      'raw-key',
    );

    expect(response).toEqual({
      message: 'cached',
      paypalBatchId: 'batch-1',
    });
    expect(payoutRepository.findOne).not.toHaveBeenCalled();
  });

  it('fails payout and stores idempotency response', async () => {
    idempotencyService.normalizeKey.mockReturnValue('key');
    idempotencyService.get.mockResolvedValue(null);
    const payout = {
      id: 'payout-id',
      status: EstadoPayoutEnum.PENDING,
      attempts: 0,
      lastError: null,
    };
    payoutRepository.findOne.mockResolvedValue(payout);
    payoutRepository.save.mockResolvedValue(payout);

    const response = await service.failPayout(
      'PYO_123',
      ' failure ',
      'admin-id',
      { ip: '127.0.0.1', userAgent: 'jest' },
      'raw-key',
    );

    expect(response).toEqual({
      message: ErrorMessages.PAYOUTS.PAYOUT_FAILED,
    });
    expect(payout.status).toBe(EstadoPayoutEnum.FAILED);
    expect(payout.lastError).toBe('failure');
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.WITHDRAWAL_FAILED,
        result: AuditResult.FAILED,
      }),
    );
    expect(idempotencyService.store).toHaveBeenCalled();
  });

  it('rejects invalid status on getAllPayouts', async () => {
    payoutRepository.createQueryBuilder.mockReturnValue(buildQuery());

    await expect(service.getAllPayouts(1, 10, 'INVALID')).rejects.toThrow(
      ErrorMessages.VALIDATION.INVALID_FORMAT('status'),
    );
  });

  it('throws when payout does not exist', async () => {
    payoutRepository.findOne.mockResolvedValue(null);

    await expect(service.executePaypalPayout('PYO_123')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when payout is not pending', async () => {
    payoutRepository.findOne.mockResolvedValue({
      id: 'payout-id',
      status: EstadoPayoutEnum.PAID,
      amount: 10,
      driver: { paypalEmail: 'driver@epn.edu.ec' },
    });

    await expect(service.executePaypalPayout('PYO_123')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when payout amount is below minimum', async () => {
    payoutRepository.findOne.mockResolvedValue({
      id: 'payout-id',
      status: EstadoPayoutEnum.PENDING,
      amount: 4,
      driver: { paypalEmail: 'driver@epn.edu.ec' },
    });

    await expect(service.executePaypalPayout('PYO_123')).rejects.toThrow(
      ErrorMessages.PAYMENTS.MIN_WITHDRAWAL,
    );
  });

  it('throws when payout has no paypal email', async () => {
    payoutRepository.findOne.mockResolvedValue({
      id: 'payout-id',
      status: EstadoPayoutEnum.PENDING,
      amount: 10,
      driver: {},
    });

    await expect(service.executePaypalPayout('PYO_123')).rejects.toThrow(
      ErrorMessages.PAYMENTS.INVALID_PAYPAL_ACCOUNT,
    );
  });

  it('updates payout on successful paypal execution', async () => {
    const payout = {
      id: 'payout-id',
      status: EstadoPayoutEnum.PENDING,
      amount: 10,
      driver: { paypalEmail: 'driver@epn.edu.ec' },
      attempts: 0,
    };
    payoutRepository.findOne.mockResolvedValue(payout);
    paypalClient.request.mockResolvedValue({
      batch_header: {
        payout_batch_id: 'batch-id',
        batch_status: 'SUCCESS',
      },
    });

    const result = await service.executePaypalPayout('PYO_123');

    expect(result).toEqual({
      message: ErrorMessages.PAYOUTS.PAYOUT_SENT,
      paypalBatchId: 'batch-id',
    });
    expect(payout.status).toBe(EstadoPayoutEnum.PAID);
    expect(payoutRepository.save).toHaveBeenCalled();
  });

  it('marks payout as failed when paypal request fails', async () => {
    const payout = {
      id: 'payout-id',
      status: EstadoPayoutEnum.PENDING,
      amount: 10,
      driver: { paypalEmail: 'driver@epn.edu.ec' },
      attempts: 0,
    };
    payoutRepository.findOne.mockResolvedValue(payout);
    paypalClient.request.mockRejectedValue(new Error('paypal-error'));

    await expect(service.executePaypalPayout('PYO_123')).rejects.toThrow(
      ErrorMessages.PAYMENTS.PAYMENT_FAILED,
    );

    expect(payout.status).toBe(EstadoPayoutEnum.FAILED);
    expect(payoutRepository.save).toHaveBeenCalled();
  });
});
