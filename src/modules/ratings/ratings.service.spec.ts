import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { EstadoRutaEnum } from '../routes/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';

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
});
