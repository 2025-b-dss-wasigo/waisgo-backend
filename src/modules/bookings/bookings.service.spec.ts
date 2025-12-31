import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { EstadoReservaEnum } from './Enums';
import { EstadoRutaEnum } from '../routes/Enums';
import { MetodoPagoEnum } from '../payments/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import { Route } from '../routes/Models/route.entity';
import { Booking } from './Models/booking.entity';
import { RouteStop } from '../routes/Models/route-stop.entity';
import * as routeTimeUtil from '../common/utils/route-time.util';

describe('BookingsService', () => {
  const bookingRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };
  const routeRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const routeStopRepository = {
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const driverRepository = {
    findOne: jest.fn(),
  };
  const profileRepository = {
    findOne: jest.fn(),
  };
  const paymentRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const paymentsService = {
    reversePayment: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: BookingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    bookingRepository.manager.transaction.mockImplementation(async (work) =>
      work({} as never),
    );
    service = new BookingsService(
      bookingRepository as never,
      routeRepository as never,
      routeStopRepository as never,
      driverRepository as never,
      profileRepository as never,
      paymentRepository as never,
      paymentsService as never,
      auditService as never,
    );
  });

  it('throws when profile is missing', async () => {
    profileRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createBooking('passenger-id', {
        routeId: 'RTE_123',
        metodoPago: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws when passenger is blocked by rating', async () => {
    profileRepository.findOne.mockResolvedValue({
      isBloqueadoPorRating: true,
      ratingPromedio: 5,
    });

    await expect(
      service.createBooking('passenger-id', {
        routeId: 'RTE_123',
        metodoPago: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when passenger has debt', async () => {
    profileRepository.findOne.mockResolvedValue({
      isBloqueadoPorRating: false,
      ratingPromedio: 5,
    });
    bookingRepository.count.mockResolvedValue(1);

    await expect(
      service.createBooking('passenger-id', {
        routeId: 'RTE_123',
        metodoPago: MetodoPagoEnum.EFECTIVO,
      }),
    ).rejects.toThrow(ErrorMessages.BOOKINGS.PASSENGER_HAS_DEBT);
  });

  it('throws when pickup coords are incomplete', async () => {
    profileRepository.findOne.mockResolvedValue({
      isBloqueadoPorRating: false,
      ratingPromedio: 5,
    });
    bookingRepository.count.mockResolvedValue(0);

    await expect(
      service.createBooking('passenger-id', {
        routeId: 'RTE_123',
        metodoPago: MetodoPagoEnum.EFECTIVO,
        pickupLat: 1,
      }),
    ).rejects.toThrow(
      ErrorMessages.VALIDATION.INVALID_FORMAT('pickupCoords'),
    );
  });

  it('creates booking and logs audit events', async () => {
    profileRepository.findOne.mockResolvedValue({
      isBloqueadoPorRating: false,
      ratingPromedio: 5,
    });
    bookingRepository.count.mockResolvedValue(0);

    const transactionSpy = jest
      .spyOn(service as never, 'createBookingTransaction')
      .mockResolvedValue({
        bookingId: 'booking-id',
        bookingPublicId: 'BKG_123',
        otp: '123456',
        routeId: 'route-id',
      });

    const response = await service.createBooking(
      'passenger-id',
      {
        routeId: 'RTE_123',
        metodoPago: MetodoPagoEnum.EFECTIVO,
      },
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.BOOKINGS.BOOKING_CREATED,
      bookingId: 'BKG_123',
      otp: '123456',
    });
    expect(transactionSpy).toHaveBeenCalled();
    expect(auditService.logEvent).toHaveBeenCalledTimes(2);
  });

  it('createBookingTransaction throws when route is missing', async () => {
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const bookingRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const stopRepo = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Route) return routeRepo;
        if (entity === Booking) return bookingRepo;
        if (entity === RouteStop) return stopRepo;
        return null;
      }),
    };

    await expect(
      (service as never).createBookingTransaction(
        manager,
        'passenger-id',
        {
          routeId: 'RTE_123',
          metodoPago: MetodoPagoEnum.EFECTIVO,
        },
        { hasPickup: false },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('createBookingTransaction throws when booking already exists', async () => {
    const route = {
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      asientosDisponibles: 2,
      precioPasajero: 2,
    } as Route;
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue(route),
      save: jest.fn(),
    };
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'existing' }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const stopRepo = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Route) return routeRepo;
        if (entity === Booking) return bookingRepo;
        if (entity === RouteStop) return stopRepo;
        return null;
      }),
    };

    await expect(
      (service as never).createBookingTransaction(
        manager,
        'passenger-id',
        {
          routeId: 'RTE_123',
          metodoPago: MetodoPagoEnum.EFECTIVO,
        },
        { hasPickup: false },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('createBookingTransaction creates booking and updates route', async () => {
    const route = {
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      asientosDisponibles: 2,
      precioPasajero: 2,
    } as Route;
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue(route),
      save: jest.fn(),
    };
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((input) => ({ ...input })),
      save: jest.fn().mockResolvedValue({
        id: 'booking-id',
        publicId: 'BKG_123',
      }),
    };
    const stopRepo = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Route) return routeRepo;
        if (entity === Booking) return bookingRepo;
        if (entity === RouteStop) return stopRepo;
        return null;
      }),
    };

    const otpSpy = jest
      .spyOn(service as never, 'generateOtp')
      .mockReturnValue('123456');

    const result = await (service as never).createBookingTransaction(
      manager,
      'passenger-id',
      {
        routeId: 'RTE_123',
        metodoPago: MetodoPagoEnum.EFECTIVO,
      },
      { hasPickup: false },
    );

    expect(result).toEqual({
      bookingId: 'booking-id',
      bookingPublicId: 'BKG_123',
      otp: '123456',
      routeId: 'route-id',
    });
    expect(routeRepo.save).toHaveBeenCalled();

    otpSpy.mockRestore();
  });

  it('rejects cancellation when too late', async () => {
    bookingRepository.findOne.mockResolvedValue({
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      routeId: 'route-id',
      route: { fecha: '2025-01-01', horaSalida: '10:00' },
    });

    jest
      .spyOn(routeTimeUtil, 'getDepartureDate')
      .mockReturnValue(new Date(Date.now() + 30 * 60 * 1000));

    await expect(
      service.cancelBooking('passenger-id', 'BKG_123', context),
    ).rejects.toThrow(ErrorMessages.BOOKINGS.CANCELLATION_TOO_LATE);
  });
});
