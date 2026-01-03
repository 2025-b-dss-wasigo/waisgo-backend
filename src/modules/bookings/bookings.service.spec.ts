import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { EstadoReservaEnum } from './Enums';
import { EstadoRutaEnum } from '../routes/Enums';
import { EstadoPagoEnum, MetodoPagoEnum } from '../payments/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import { Route } from '../routes/Models/route.entity';
import { Booking } from './Models/booking.entity';
import { RouteStop } from '../routes/Models/route-stop.entity';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import * as routeTimeUtil from '../common/utils/route-time.util';
import { AuditAction } from '../audit/Enums';
import * as publicIdUtil from '../common/utils/public-id.util';
import * as routeStopUtil from '../common/utils/route-stop.util';

describe('BookingsService', () => {
  const bookingRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
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
  const configService = {
    get: jest.fn(),
  };

  const context: AuthContext = { ip: '127.0.0.1', userAgent: 'jest' };

  let service: BookingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'OTP_SECRET' || key === 'JWT_SECRET') {
        return '12345678901234567890123456789012';
      }
      return undefined;
    });
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
      configService as never,
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
    ).rejects.toThrow(ErrorMessages.VALIDATION.INVALID_FORMAT('pickupCoords'));
  });

  it('throws when pickup address is missing', async () => {
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
        pickupLng: 2,
      }),
    ).rejects.toThrow(
      ErrorMessages.VALIDATION.REQUIRED_FIELD('pickupDireccion'),
    );
  });

  it('creates booking and logs audit events', async () => {
    profileRepository.findOne.mockResolvedValue({
      isBloqueadoPorRating: false,
      ratingPromedio: 5,
    });
    bookingRepository.count.mockResolvedValue(0);

    const transactionSpy = jest
      .spyOn(service as any, 'createBookingTransaction')
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
      (service as any).createBookingTransaction(
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
      (service as any).createBookingTransaction(
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
      .spyOn(service as any, 'generateOtp')
      .mockReturnValue('123456');

    const result = await (service as any).createBookingTransaction(
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

  it('createBookingTransaction rejects inactive routes', async () => {
    const route = {
      id: 'route-id',
      estado: EstadoRutaEnum.CANCELADA,
      asientosDisponibles: 2,
      precioPasajero: 2,
    } as Route;
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue(route),
      save: jest.fn(),
    };
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
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
      (service as any).createBookingTransaction(
        manager,
        'passenger-id',
        {
          routeId: 'RTE_123',
          metodoPago: MetodoPagoEnum.EFECTIVO,
        },
        { hasPickup: false },
      ),
    ).rejects.toThrow(ErrorMessages.ROUTES.ROUTE_NOT_ACTIVE);
  });

  it('createBookingTransaction rejects full routes', async () => {
    const route = {
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      asientosDisponibles: 0,
      precioPasajero: 2,
    } as Route;
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue(route),
      save: jest.fn(),
    };
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
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
      (service as any).createBookingTransaction(
        manager,
        'passenger-id',
        {
          routeId: 'RTE_123',
          metodoPago: MetodoPagoEnum.EFECTIVO,
        },
        { hasPickup: false },
      ),
    ).rejects.toThrow(ErrorMessages.ROUTES.ROUTE_FULL);
  });

  it('createBookingTransaction rejects routes without price', async () => {
    const route = {
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      asientosDisponibles: 1,
      precioPasajero: 0,
    } as Route;
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue(route),
      save: jest.fn(),
    };
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
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
      (service as any).createBookingTransaction(
        manager,
        'passenger-id',
        {
          routeId: 'RTE_123',
          metodoPago: MetodoPagoEnum.EFECTIVO,
        },
        { hasPickup: false },
      ),
    ).rejects.toThrow(ErrorMessages.ROUTES.ROUTE_PRICE_REQUIRED);
  });

  it('insertPickupStop shifts stops and saves new stop', async () => {
    const stopRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 's1', orden: 1, lat: 0, lng: 0 },
        { id: 's2', orden: 2, lat: 1, lng: 1 },
      ]),
      save: jest.fn(),
      create: jest.fn().mockImplementation((input) => ({ ...input })),
    };

    const planSpy = jest
      .spyOn(routeStopUtil, 'planStopInsertion')
      .mockReturnValue({
        newOrder: 2,
        updates: [{ publicId: 's2', orden: 3, lat: 1, lng: 1 } as any],
      });
    const idSpy = jest
      .spyOn(publicIdUtil, 'generatePublicId')
      .mockResolvedValue('STP_123');

    await (service as any).insertPickupStop(stopRepo, 'route-id', {
      hasPickup: true,
      pickupLat: 1,
      pickupLng: 2,
      pickupDireccion: 'Calle 1',
    });

    expect(stopRepo.save).toHaveBeenCalledTimes(2);
    expect(stopRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        routeId: 'route-id',
        publicId: 'STP_123',
        lat: 1,
        lng: 2,
        direccion: 'Calle 1',
        orden: 2,
      }),
    );

    planSpy.mockRestore();
    idSpy.mockRestore();
  });

  it('rejects invalid status filter on getMyBookings', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };
    bookingRepository.createQueryBuilder.mockReturnValue(query);

    await expect(
      service.getMyBookings('passenger-id', 'INVALID'),
    ).rejects.toThrow(ErrorMessages.VALIDATION.INVALID_FORMAT('estado'));
  });

  it('hides OTP when the departure window has expired', async () => {
    const departureSpy = jest
      .spyOn(routeTimeUtil, 'getDepartureDate')
      .mockReturnValue(new Date(Date.now() - 3 * 60 * 60 * 1000));

    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'booking-id',
          estado: EstadoReservaEnum.COMPLETADA,
          otp: '123456',
          route: { fecha: '2025-01-01', horaSalida: '10:00' },
        } as Booking,
      ]),
    };

    bookingRepository.createQueryBuilder.mockReturnValue(query);

    const result = await service.getMyBookings('passenger-id');

    expect(result.data?.[0].otp).toBeUndefined();
    departureSpy.mockRestore();
  });

  it('returns no refund when cancellation occurs within 1 hour of departure', async () => {
    bookingRepository.findOne.mockResolvedValue({
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      routeId: 'route-id',
      route: { fecha: '2030-01-15', horaSalida: '10:00' },
    });

    const departureSpy = jest
      .spyOn(routeTimeUtil, 'getDepartureDate')
      .mockReturnValue(new Date(Date.now() + 30 * 60 * 1000));

    const bookingRepo = { update: jest.fn() };
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'route-id',
        asientosDisponibles: 1,
        asientosTotales: 2,
      }),
      save: jest.fn(),
    };

    bookingRepository.manager.transaction.mockImplementation(async (work) =>
      work({
        getRepository: jest.fn((entity) => {
          if (entity === Booking) return bookingRepo;
          if (entity === Route) return routeRepo;
          return null;
        }),
      } as never),
    );

    const response = await service.cancelBooking(
      'passenger-id',
      'BKG_123',
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.BOOKINGS.NO_REFUND,
    });

    departureSpy.mockRestore();
  });

  it('cancels booking and marks pending payment failed', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      routeId: 'route-id',
      route: { fecha: '2025-01-01', horaSalida: '10:00' },
    };
    bookingRepository.findOne.mockResolvedValue(booking);

    const bookingRepo = { update: jest.fn() };
    const routeRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'route-id',
        asientosDisponibles: 1,
        asientosTotales: 2,
      }),
      save: jest.fn(),
    };
    bookingRepository.manager.transaction.mockImplementation(async (work) =>
      work({
        getRepository: jest.fn((entity) => {
          if (entity === Booking) return bookingRepo;
          if (entity === Route) return routeRepo;
          return null;
        }),
      } as never),
    );

    const departureSpy = jest
      .spyOn(routeTimeUtil, 'getDepartureDate')
      .mockReturnValue(new Date(Date.now() + 2 * 60 * 60 * 1000));

    const payment = {
      id: 'payment-id',
      bookingId: 'booking-id',
      status: EstadoPagoEnum.PENDING,
      failureReason: null,
    };
    paymentRepository.findOne.mockResolvedValue(payment);
    paymentRepository.save.mockResolvedValue(payment);

    const response = await service.cancelBooking(
      'passenger-id',
      'BKG_123',
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.BOOKINGS.CANCELLATION_SUCCESS,
    });
    expect(payment.status).toBe(EstadoPagoEnum.FAILED);
    expect(payment.failureReason).toBe('Booking cancelled');
    expect(paymentRepository.save).toHaveBeenCalled();

    departureSpy.mockRestore();
  });

  it('rejects invalid OTP and logs audit', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    const booking = {
      id: 'booking-id',
      routeId: 'route-id',
      route: { driverId: 'driver-id' },
      estado: EstadoReservaEnum.CONFIRMADA,
      otpUsado: false,
      otp: '123456',
    };
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(booking),
    };
    bookingRepository.createQueryBuilder.mockReturnValue(query);

    await expect(
      service.verifyOtp('driver-user', 'BKG_123', '999999', context),
    ).rejects.toThrow(ErrorMessages.TRIP_OTP.OTP_INVALID);

    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.TRIP_OTP_INVALID,
      }),
    );
  });

  it('verifies OTP and logs success', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    const booking = {
      id: 'booking-id',
      routeId: 'route-id',
      route: { driverId: 'driver-id' },
      estado: EstadoReservaEnum.CONFIRMADA,
      otpUsado: false,
      otp: '123456',
    };
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(booking),
    };
    bookingRepository.createQueryBuilder.mockReturnValue(query);
    bookingRepository.save.mockResolvedValue(booking);

    const response = await service.verifyOtp(
      'driver-user',
      'BKG_123',
      '123456',
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.TRIP_OTP.TRIP_STARTED,
    });
    expect(booking.otpUsado).toBe(true);
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.TRIP_OTP_VALIDATED,
      }),
    );
  });

  it('marks paid payment as failed when refund fails on cancel', async () => {
    const booking = {
      id: 'booking-id',
      passengerId: 'passenger-id',
      estado: EstadoReservaEnum.CONFIRMADA,
      routeId: 'route-id',
      route: { fecha: '2025-01-01', horaSalida: '10:00' },
    };
    bookingRepository.findOne.mockResolvedValue(booking);

    bookingRepository.manager.transaction.mockImplementation(async (work) =>
      work({
        getRepository: jest.fn((entity) => {
          if (entity === Booking) return { update: jest.fn() };
          if (entity === Route)
            return {
              findOne: jest.fn().mockResolvedValue({
                id: 'route-id',
                asientosDisponibles: 1,
                asientosTotales: 2,
              }),
              save: jest.fn(),
            };
          return null;
        }),
      } as never),
    );

    const departureSpy = jest
      .spyOn(routeTimeUtil, 'getDepartureDate')
      .mockReturnValue(new Date(Date.now() + 2 * 60 * 60 * 1000));

    const payment = {
      id: 'payment-id',
      bookingId: 'booking-id',
      status: EstadoPagoEnum.PAID,
      failureReason: null,
    };
    paymentRepository.findOne.mockResolvedValue(payment);
    paymentRepository.save.mockResolvedValue(payment);
    paymentsService.reversePayment.mockRejectedValue(new Error('refund error'));

    await service.cancelBooking('passenger-id', 'BKG_123', context);

    expect(payment.status).toBe(EstadoPagoEnum.FAILED);
    expect(payment.failureReason).toBe('refund error');
    expect(paymentRepository.save).toHaveBeenCalledWith(payment);

    departureSpy.mockRestore();
  });

  it('completes booking and finalizes route when ready', async () => {
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      estado: EstadoConductorEnum.APROBADO,
    });
    bookingRepository.findOne.mockResolvedValue({
      id: 'booking-id',
      routeId: 'route-id',
      route: { driverId: 'driver-id' },
      estado: EstadoReservaEnum.CONFIRMADA,
      otpUsado: true,
    });
    bookingRepository.save.mockResolvedValue({});
    bookingRepository.count.mockResolvedValue(0);
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
    });
    routeRepository.save.mockResolvedValue({});

    const response = await service.completeBooking(
      'driver-user',
      'BKG_123',
      context,
    );

    expect(response).toEqual({
      message: ErrorMessages.BOOKINGS.BOOKING_COMPLETED,
    });
    expect(routeRepository.save).toHaveBeenCalled();
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ROUTE_COMPLETED,
      }),
    );
  });
});
