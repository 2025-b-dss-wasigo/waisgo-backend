import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { EstadoRutaEnum } from '../routes/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import { AuditAction } from '../audit/Enums';

describe('RatingsService', () => {
  const ratingRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    findAndCount: jest.fn(),
  };
  const routeRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
  };
  const bookingRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
    find: jest.fn(),
  };
  const driverRepository = {
    findOne: jest.fn(),
  };
  const businessUserRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const profileRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const auditService = {
    logEvent: jest.fn(),
  };

  let service: RatingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RatingsService(
      ratingRepository as never,
      routeRepository as never,
      bookingRepository as never,
      driverRepository as never,
      businessUserRepository as never,
      profileRepository as never,
      auditService as never,
    );
  });

  it('throws when route is missing', async () => {
    routeRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createRating('user-id', {
        routeId: 'RTE_123',
        toUserId: 'USR_123',
        score: 5,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws when route is not finalized', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.ACTIVA,
      updatedAt: new Date(),
    });

    await expect(
      service.createRating('user-id', {
        routeId: 'RTE_123',
        toUserId: 'USR_123',
        score: 5,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when rating window expired', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      driverId: 'driver-id',
    });

    await expect(
      service.createRating('user-id', {
        routeId: 'RTE_123',
        toUserId: 'USR_123',
        score: 5,
      }),
    ).rejects.toThrow(ErrorMessages.RATINGS.RATING_WINDOW_EXPIRED);
  });

  it('throws when target user is not found', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({ userId: 'driver-user' });
    businessUserRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createRating('user-id', {
        routeId: 'RTE_123',
        toUserId: 'USR_ABCDEFGH',
        score: 5,
      }),
    ).rejects.toThrow(ErrorMessages.USER.NOT_FOUND);
  });

  it('throws when user did not participate in route', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({ userId: 'driver-user' });
    businessUserRepository.findOne.mockResolvedValue({ id: 'driver-user' });
    bookingRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createRating('other-user', {
        routeId: 'RTE_123',
        toUserId: 'USR_ABCDEFGH',
        score: 5,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws when passenger tries to rate a non-driver user', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({ userId: 'driver-user' });
    businessUserRepository.findOne.mockResolvedValue({ id: 'other-user' });
    bookingRepository.findOne.mockResolvedValue({ id: 'booking-id' });

    await expect(
      service.createRating('passenger-id', {
        routeId: 'RTE_123',
        toUserId: 'USR_ABCDEFGH',
        score: 5,
      }),
    ).rejects.toThrow(ErrorMessages.RATINGS.NOT_PARTICIPANT);
  });

  it('throws when driver rates a user without booking', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({ userId: 'driver-user' });
    businessUserRepository.findOne.mockResolvedValue({ id: 'passenger-id' });
    bookingRepository.findOne.mockResolvedValue(null);

    await expect(
      service.createRating('driver-user', {
        routeId: 'RTE_123',
        toUserId: 'USR_ABCDEFGH',
        score: 5,
      }),
    ).rejects.toThrow(ErrorMessages.RATINGS.NOT_PARTICIPANT);
  });

  it('creates rating and updates user rating stats', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({
      id: 'driver-id',
      userId: 'driver-user',
    });
    businessUserRepository.findOne.mockResolvedValue({ id: 'driver-user' });
    bookingRepository.findOne.mockResolvedValue({ id: 'booking-id' });
    ratingRepository.findOne.mockResolvedValue(null);
    ratingRepository.create.mockImplementation((input) => ({ ...input }));
    ratingRepository.save.mockResolvedValue({
      id: 'rating-id',
      publicId: 'RAT_123',
    });

    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avg: '2.5', count: '2' }),
    };
    ratingRepository.createQueryBuilder.mockReturnValue(qb);
    profileRepository.findOne.mockResolvedValue({
      userId: 'driver-user',
      ratingPromedio: 4,
      isBloqueadoPorRating: false,
    });
    profileRepository.save.mockResolvedValue({});

    const result = await service.createRating('passenger-id', {
      routeId: 'RTE_123',
      toUserId: 'USR_ABCDEFGH',
      score: 4,
      comment: 'good',
    });

    expect(result).toEqual({
      message: ErrorMessages.RATINGS.RATING_SUCCESS,
      ratingId: 'RAT_123',
    });
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.RATING_GIVEN,
      }),
    );
  });

  it('throws when toUserId is invalid format (uuid not allowed)', async () => {
    const previous = process.env.ALLOW_UUID_IDENTIFIERS;
    process.env.ALLOW_UUID_IDENTIFIERS = 'false';

    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({ userId: 'driver-user' });

    await expect(
      service.createRating('user-id', {
        routeId: 'RTE_123',
        toUserId: '6b8b4567-90ab-cdef-1234-567890abcdef',
        score: 5,
      }),
    ).rejects.toThrow(
      ErrorMessages.VALIDATION.INVALID_FORMAT('toUserId'),
    );

    if (previous === undefined) {
      delete process.env.ALLOW_UUID_IDENTIFIERS;
    } else {
      process.env.ALLOW_UUID_IDENTIFIERS = previous;
    }
  });

  it('returns summary data', async () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avg: '4', count: '2' }),
    };
    ratingRepository.createQueryBuilder.mockReturnValue(qb);
    bookingRepository.count.mockResolvedValue(3);
    driverRepository.findOne.mockResolvedValue({ id: 'driver-id' });
    routeRepository.count.mockResolvedValue(2);

    const result = await service.getRatingSummary('user-id');

    expect(result).toEqual({
      message: ErrorMessages.RATINGS.RATINGS_SUMMARY,
      average: 4,
      totalRatings: 2,
      totalTrips: 5,
    });
  });

  it('canRateRoute returns false when route is missing', async () => {
    routeRepository.findOne.mockResolvedValue(null);

    const result = await service.canRateRoute('user-id', 'RTE_123');

    expect(result).toEqual({
      canRate: false,
      reason: ErrorMessages.ROUTES.ROUTE_NOT_FOUND,
    });
  });

  it('canRateRoute returns false when already rated', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({ userId: 'driver-user' });
    bookingRepository.findOne.mockResolvedValue({ id: 'booking-id' });
    ratingRepository.find.mockResolvedValue([{ toUserId: 'driver-user' }]);

    const result = await service.canRateRoute('passenger-id', 'RTE_123');

    expect(result).toEqual({
      canRate: false,
      reason: ErrorMessages.RATINGS.ALREADY_RATED,
    });
  });

  it('canRateRoute returns users to rate for passengers', async () => {
    routeRepository.findOne.mockResolvedValue({
      id: 'route-id',
      estado: EstadoRutaEnum.FINALIZADA,
      updatedAt: new Date(),
      driverId: 'driver-id',
    });
    driverRepository.findOne.mockResolvedValue({ userId: 'driver-user' });
    bookingRepository.findOne.mockResolvedValue({ id: 'booking-id' });
    ratingRepository.find.mockResolvedValue([]);
    businessUserRepository.find.mockResolvedValue([
      {
        id: 'driver-user',
        alias: 'Alias',
        publicId: 'USR_123',
        profile: { nombre: 'Ana', apellido: 'Perez' },
      },
    ]);

    const result = await service.canRateRoute('passenger-id', 'RTE_123');

    expect(result.canRate).toBe(true);
    expect(result.usersToRate?.[0]).toEqual({
      userId: 'Alias',
      name: 'Ana Perez',
    });
  });
});
