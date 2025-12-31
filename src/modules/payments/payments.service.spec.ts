import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Booking } from '../bookings/Models/booking.entity';
import { Payment } from './Models/payment.entity';
import { EstadoReservaEnum } from '../bookings/Enums';
import { EstadoPagoEnum, MetodoPagoEnum } from './Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import * as publicIdUtil from '../common/utils/public-id.util';

describe('PaymentsService', () => {
  const paymentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const bookingRepo = {
    findOne: jest.fn(),
  };
  const driverRepo = {
    findOne: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const paypalClient = {
    request: jest.fn(),
  };
  const idempotencyService = {
    normalizeKey: jest.fn(),
    get: jest.fn(),
    store: jest.fn(),
  };

  let service: PaymentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    idempotencyService.normalizeKey.mockReturnValue(null);
    service = new PaymentsService(
      paymentRepo as unknown as never,
      bookingRepo as unknown as never,
      driverRepo as unknown as never,
      auditService as unknown as never,
      configService as unknown as never,
      paypalClient as unknown as never,
      idempotencyService as unknown as never,
    );
  });

  it('throws when booking is not found', async () => {
    bookingRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createPayment('passenger-id', {
        bookingId: 'BKG_123',
        method: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws when booking belongs to another passenger', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'other-passenger',
      estado: EstadoReservaEnum.CONFIRMADA,
      metodoPago: MetodoPagoEnum.EFECTIVO,
      route: { precioPasajero: 2.5 },
    } as Booking;

    bookingRepo.findOne.mockResolvedValue(booking);

    await expect(
      service.createPayment('passenger-id', {
        bookingId: 'BKG_123',
        method: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when booking is not active', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CANCELADA,
      metodoPago: MetodoPagoEnum.EFECTIVO,
      route: { precioPasajero: 2.5 },
    } as Booking;

    bookingRepo.findOne.mockResolvedValue(booking);

    await expect(
      service.createPayment('passenger-id', {
        bookingId: 'BKG_123',
        method: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when payment method does not match booking', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      metodoPago: MetodoPagoEnum.EFECTIVO,
      route: { precioPasajero: 2.5 },
    } as Booking;

    bookingRepo.findOne.mockResolvedValue(booking);

    await expect(
      service.createPayment('passenger-id', {
        bookingId: 'BKG_123',
        method: MetodoPagoEnum.PAYPAL,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when a payment already exists', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      metodoPago: MetodoPagoEnum.EFECTIVO,
      route: { precioPasajero: 2.5 },
    } as Booking;

    bookingRepo.findOne.mockResolvedValue(booking);
    paymentRepo.findOne.mockResolvedValue({ id: 'payment-id' } as Payment);

    await expect(
      service.createPayment('passenger-id', {
        bookingId: 'BKG_123',
        method: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws when route price is missing', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      metodoPago: MetodoPagoEnum.EFECTIVO,
      route: { precioPasajero: 0 },
    } as Booking;

    bookingRepo.findOne.mockResolvedValue(booking);
    paymentRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createPayment('passenger-id', {
        bookingId: 'BKG_123',
        method: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(ErrorMessages.ROUTES.ROUTE_PRICE_REQUIRED);
  });

  it('creates a payment for a valid booking', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      metodoPago: MetodoPagoEnum.EFECTIVO,
      route: { precioPasajero: 2.5 },
    } as Booking;

    bookingRepo.findOne.mockResolvedValue(booking);
    paymentRepo.findOne.mockResolvedValue(null);
    paymentRepo.create.mockImplementation((input) => ({ ...input }));
    paymentRepo.save.mockImplementation(async (input) => ({
      ...input,
      id: 'payment-id',
    }));

    const publicIdSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('PAY_TEST');

    const response = await service.createPayment('passenger-id', {
      bookingId: 'BKG_123',
      method: MetodoPagoEnum.EFECTIVO,
    });

    expect(response).toEqual({
      message: ErrorMessages.PAYMENTS.PAYMENT_INITIATED,
      paymentId: 'PAY_TEST',
    });

    publicIdSpy.mockRestore();
  });

  it('throws when paypal payment is not found', async () => {
    paymentRepo.findOne.mockResolvedValue(null);

    await expect(
      service.createPaypalOrder('passenger-id', 'PAY_123'),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates a paypal order for a valid payment', async () => {
    const payment = {
      id: 'payment-id',
      booking: { passengerId: 'passenger-id' },
      method: MetodoPagoEnum.PAYPAL,
      status: EstadoPagoEnum.PENDING,
      currency: 'USD',
      amount: 2.5,
    } as Payment;

    paymentRepo.findOne.mockResolvedValue(payment);
    paymentRepo.save.mockResolvedValue(payment);
    configService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://frontend';
      return undefined;
    });
    paypalClient.request.mockResolvedValue({
      id: 'ORDER_123',
      links: [{ rel: 'approve', href: 'http://approval' }],
    });

    const response = await service.createPaypalOrder(
      'passenger-id',
      'PAY_123',
    );

    expect(response).toEqual({
      message: ErrorMessages.PAYMENTS.PAYPAL_ORDER_CREATED,
      approvalUrl: 'http://approval',
      paypalOrderId: 'ORDER_123',
    });
    expect(payment.paypalOrderId).toBe('ORDER_123');
  });

  it('captures a paypal order and updates payment', async () => {
    const payment = {
      id: 'payment-id',
      booking: { passengerId: 'passenger-id' },
      method: MetodoPagoEnum.PAYPAL,
      status: EstadoPagoEnum.PENDING,
      paypalOrderId: 'ORDER_123',
    } as Payment;

    paymentRepo.findOne.mockResolvedValue(payment);
    paymentRepo.save.mockResolvedValue(payment);
    paypalClient.request.mockResolvedValue({
      status: 'COMPLETED',
      purchase_units: [
        {
          payments: {
            captures: [{ id: 'CAPTURE_1' }],
          },
        },
      ],
    });

    const response = await service.capturePaypalOrder(
      'passenger-id',
      'PAY_123',
      'ORDER_123',
    );

    expect(response).toEqual({
      message: ErrorMessages.PAYMENTS.PAYPAL_CAPTURED,
    });
    expect(payment.status).toBe(EstadoPagoEnum.PAID);
  });
});
