import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { EstadoPayoutEnum } from '../Enums';
import { ErrorMessages } from '../../common/constants/error-messages.constant';

describe('PayoutsService', () => {
  const payoutRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const paymentRepository = {};
  const driverRepository = {};
  const dataSource = {};
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

  it('throws when payout does not exist', async () => {
    payoutRepository.findOne.mockResolvedValue(null);

    await expect(
      service.executePaypalPayout('PYO_123'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws when payout is not pending', async () => {
    payoutRepository.findOne.mockResolvedValue({
      id: 'payout-id',
      status: EstadoPayoutEnum.PAID,
      amount: 10,
      driver: { paypalEmail: 'driver@epn.edu.ec' },
    });

    await expect(
      service.executePaypalPayout('PYO_123'),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when payout amount is below minimum', async () => {
    payoutRepository.findOne.mockResolvedValue({
      id: 'payout-id',
      status: EstadoPayoutEnum.PENDING,
      amount: 4,
      driver: { paypalEmail: 'driver@epn.edu.ec' },
    });

    await expect(
      service.executePaypalPayout('PYO_123'),
    ).rejects.toThrow(ErrorMessages.PAYMENTS.MIN_WITHDRAWAL);
  });

  it('throws when payout has no paypal email', async () => {
    payoutRepository.findOne.mockResolvedValue({
      id: 'payout-id',
      status: EstadoPayoutEnum.PENDING,
      amount: 10,
      driver: {},
    });

    await expect(
      service.executePaypalPayout('PYO_123'),
    ).rejects.toThrow(ErrorMessages.PAYMENTS.INVALID_PAYPAL_ACCOUNT);
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

    await expect(
      service.executePaypalPayout('PYO_123'),
    ).rejects.toThrow(ErrorMessages.PAYMENTS.PAYMENT_FAILED);

    expect(payout.status).toBe(EstadoPayoutEnum.FAILED);
    expect(payoutRepository.save).toHaveBeenCalled();
  });
});
