import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere } from 'typeorm';

import { Rating } from './Models/rating.entity';
import { CreateRatingDto } from './Dto';
import { Route } from '../routes/Models/route.entity';
import { Booking } from '../bookings/Models/booking.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { BusinessUser } from '../business/Models/business-user.entity';
import { UserProfile } from '../business/Models/user-profile.entity';
import { EstadoRutaEnum } from '../routes/Enums';
import { EstadoReservaEnum } from '../bookings/Enums';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import {
  buildIdWhere,
  generatePublicId,
  isUuid,
  isValidIdentifier,
} from '../common/utils/public-id.util';

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);
  private readonly RATING_WINDOW_HOURS = 24;

  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepository: Repository<Rating>,
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(BusinessUser)
    private readonly businessUserRepository: Repository<BusinessUser>,
    @InjectRepository(UserProfile)
    private readonly profileRepository: Repository<UserProfile>,
    private readonly auditService: AuditService,
  ) {}

  private isRatingWindowExpired(referenceDate: Date): boolean {
    const diffHours =
      (Date.now() - referenceDate.getTime()) / (1000 * 60 * 60);
    return diffHours > this.RATING_WINDOW_HOURS;
  }

  private async updateUserRating(
    userId: string,
    context?: AuthContext,
  ): Promise<void> {
    const stats = await this.ratingRepository
      .createQueryBuilder('rating')
      .select('AVG(rating.score)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('rating.toUserId = :userId', { userId })
      .getRawOne<{ avg: string | null; count: string | null }>();

    const average = Number(stats?.avg ?? 0);
    const total = Number(stats?.count ?? 0);

    const profile = await this.profileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      return;
    }

    const wasBlocked = profile.isBloqueadoPorRating;
    profile.ratingPromedio = Number(average.toFixed(2));
    profile.totalCalificaciones = total;
    profile.isBloqueadoPorRating = profile.ratingPromedio < 3;
    await this.profileRepository.save(profile);

    if (!wasBlocked && profile.isBloqueadoPorRating) {
      await this.auditService.logEvent({
        action: AuditAction.RATING_USER_BLOCKED,
        userId,
        result: AuditResult.SUCCESS,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        metadata: { ratingPromedio: profile.ratingPromedio },
      });
    }
  }

  async createRating(
    fromUserId: string,
    dto: CreateRatingDto,
    context?: AuthContext,
  ): Promise<{ message: string; ratingId?: string }> {
    const route = await this.routeRepository.findOne({
      where: buildIdWhere<Route>(dto.routeId),
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    if (route.estado !== EstadoRutaEnum.FINALIZADA) {
      throw new BadRequestException(ErrorMessages.RATINGS.ROUTE_NOT_COMPLETED);
    }

    if (this.isRatingWindowExpired(route.updatedAt)) {
      throw new BadRequestException(ErrorMessages.RATINGS.RATING_WINDOW_EXPIRED);
    }

    const driver = await this.driverRepository.findOne({
      where: { id: route.driverId },
    });

    const driverUserId = driver?.userId;

    const identifier = dto.toUserId.trim();
    const toUserWhere: FindOptionsWhere<BusinessUser>[] = [];
    if (isValidIdentifier(identifier)) {
      toUserWhere.push(...buildIdWhere<BusinessUser>(identifier));
    } else if (!isUuid(identifier)) {
      toUserWhere.push({ alias: identifier });
    }

    if (toUserWhere.length === 0) {
      throw new BadRequestException(
        ErrorMessages.VALIDATION.INVALID_FORMAT('toUserId'),
      );
    }

    const toUser = await this.businessUserRepository.findOne({
      where: toUserWhere,
    });

    if (!toUser) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    const passengerBooking = await this.bookingRepository.findOne({
      where: {
        routeId: route.id,
        passengerId: fromUserId,
        estado: In([EstadoReservaEnum.COMPLETADA, EstadoReservaEnum.NO_SHOW]),
      },
    });

    const isDriver = driverUserId === fromUserId;
    const isPassenger = Boolean(passengerBooking);

    if (!isDriver && !isPassenger) {
      throw new ForbiddenException(ErrorMessages.RATINGS.NOT_PARTICIPANT);
    }

    if (isPassenger && toUser.id !== driverUserId) {
      throw new BadRequestException(ErrorMessages.RATINGS.NOT_PARTICIPANT);
    }

    if (isDriver) {
      const targetBooking = await this.bookingRepository.findOne({
        where: {
          routeId: route.id,
          passengerId: toUser.id,
          estado: In([EstadoReservaEnum.COMPLETADA, EstadoReservaEnum.NO_SHOW]),
        },
      });

      if (!targetBooking) {
        throw new BadRequestException(ErrorMessages.RATINGS.NOT_PARTICIPANT);
      }
    }

    const existingRating = await this.ratingRepository.findOne({
      where: {
        fromUserId,
        toUserId: toUser.id,
        routeId: route.id,
      },
    });

    if (existingRating) {
      throw new BadRequestException(ErrorMessages.RATINGS.ALREADY_RATED);
    }

    const rating = this.ratingRepository.create({
      publicId: await generatePublicId(this.ratingRepository, 'RAT'),
      fromUserId,
      toUserId: toUser.id,
      routeId: route.id,
      score: dto.score,
      comment: dto.comment?.trim() || null,
    });

    const savedRating = await this.ratingRepository.save(rating);

    await this.updateUserRating(toUser.id, context);

    await this.auditService.logEvent({
      action: AuditAction.RATING_GIVEN,
      userId: fromUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: {
        ratingId: savedRating.id,
        routeId: route.id,
        toUserId: toUser.id,
        score: dto.score,
      },
    });

    this.logger.log(
      `Rating created: ${savedRating.id} for route ${dto.routeId}`,
    );

    return {
      message: ErrorMessages.RATINGS.RATING_SUCCESS,
      ratingId: savedRating.publicId,
    };
  }

  async getMyRatings(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{ message: string; data?: Rating[]; total?: number }> {
    const pageNumber = page ? Math.max(Number(page), 1) : 1;
    const pageSize = limit ? Math.min(Math.max(Number(limit), 1), 100) : 20;

    const [ratings, total] = await this.ratingRepository.findAndCount({
      where: { toUserId: userId },
      relations: ['fromUser', 'route'],
      order: { createdAt: 'DESC' },
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    return {
      message: ErrorMessages.RATINGS.RATINGS_LIST_RECEIVED,
      data: ratings,
      total,
    };
  }

  async getRatingsGiven(
    userId: string,
    page?: number,
    limit?: number,
  ): Promise<{ message: string; data?: Rating[]; total?: number }> {
    const pageNumber = page ? Math.max(Number(page), 1) : 1;
    const pageSize = limit ? Math.min(Math.max(Number(limit), 1), 100) : 20;

    const [ratings, total] = await this.ratingRepository.findAndCount({
      where: { fromUserId: userId },
      relations: ['toUser', 'route'],
      order: { createdAt: 'DESC' },
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    return {
      message: ErrorMessages.RATINGS.RATINGS_LIST_GIVEN,
      data: ratings,
      total,
    };
  }

  async getRatingSummary(
    userId: string,
  ): Promise<{
    message: string;
    average?: number;
    totalRatings?: number;
    totalTrips?: number;
  }> {
    const stats = await this.ratingRepository
      .createQueryBuilder('rating')
      .select('AVG(rating.score)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('rating.toUserId = :userId', { userId })
      .getRawOne<{ avg: string | null; count: string | null }>();

    const average = Number(stats?.avg ?? 0);
    const totalRatings = Number(stats?.count ?? 0);

    const passengerTrips = await this.bookingRepository.count({
      where: { passengerId: userId, estado: EstadoReservaEnum.COMPLETADA },
    });

    const driver = await this.driverRepository.findOne({
      where: { userId },
    });

    const driverTrips = driver
      ? await this.routeRepository.count({
          where: { driverId: driver.id, estado: EstadoRutaEnum.FINALIZADA },
        })
      : 0;

    return {
      message: ErrorMessages.RATINGS.RATINGS_SUMMARY,
      average: Number(average.toFixed(2)),
      totalRatings,
      totalTrips: passengerTrips + driverTrips,
    };
  }

  async canRateRoute(
    userId: string,
    routeId: string,
  ): Promise<{
    canRate: boolean;
    reason?: string;
    usersToRate?: { userId: string; name: string }[];
  }> {
    const route = await this.routeRepository.findOne({
      where: buildIdWhere<Route>(routeId),
    });

    if (!route) {
      return { canRate: false, reason: ErrorMessages.ROUTES.ROUTE_NOT_FOUND };
    }

    if (route.estado !== EstadoRutaEnum.FINALIZADA) {
      return {
        canRate: false,
        reason: ErrorMessages.RATINGS.ROUTE_NOT_COMPLETED,
      };
    }

    if (this.isRatingWindowExpired(route.updatedAt)) {
      return {
        canRate: false,
        reason: ErrorMessages.RATINGS.RATING_WINDOW_EXPIRED,
      };
    }

    const driver = await this.driverRepository.findOne({
      where: { id: route.driverId },
    });

    const driverUserId = driver?.userId;

    const passengerBooking = await this.bookingRepository.findOne({
      where: {
        routeId: route.id,
        passengerId: userId,
        estado: In([EstadoReservaEnum.COMPLETADA, EstadoReservaEnum.NO_SHOW]),
      },
    });

    const isDriver = driverUserId === userId;
    const isPassenger = Boolean(passengerBooking);

    if (!isDriver && !isPassenger) {
      return { canRate: false, reason: ErrorMessages.RATINGS.NOT_PARTICIPANT };
    }

    const existingRatings = await this.ratingRepository.find({
      where: { fromUserId: userId, routeId: route.id },
    });
    const ratedUserIds = new Set(existingRatings.map((r) => r.toUserId));

    let targetUserIds: string[] = [];

    if (isPassenger && driverUserId) {
      targetUserIds = [driverUserId];
    }

    if (isDriver) {
      const bookings = await this.bookingRepository.find({
        where: {
          routeId: route.id,
          estado: In([EstadoReservaEnum.COMPLETADA, EstadoReservaEnum.NO_SHOW]),
        },
      });
      targetUserIds = bookings.map((booking) => booking.passengerId);
    }

    targetUserIds = targetUserIds.filter((id) => !ratedUserIds.has(id));

    if (targetUserIds.length === 0) {
      return { canRate: false, reason: ErrorMessages.RATINGS.ALREADY_RATED };
    }

    const users = await this.businessUserRepository.find({
      where: { id: In(targetUserIds) },
      relations: ['profile'],
    });

    const usersToRate = users.map((user) => ({
      userId: user.alias || user.publicId,
      name: user.profile
        ? `${user.profile.nombre} ${user.profile.apellido}`.trim()
        : user.alias,
    }));

    return {
      canRate: usersToRate.length > 0,
      usersToRate,
    };
  }

  async getAllRatings(
    page?: number,
    limit?: number,
  ): Promise<{ message: string; data?: Rating[]; total?: number }> {
    const pageNumber = page ? Math.max(Number(page), 1) : 1;
    const pageSize = limit ? Math.min(Math.max(Number(limit), 1), 100) : 20;

    const [ratings, total] = await this.ratingRepository.findAndCount({
      relations: ['fromUser', 'toUser', 'route'],
      order: { createdAt: 'DESC' },
      skip: (pageNumber - 1) * pageSize,
      take: pageSize,
    });

    return {
      message: ErrorMessages.RATINGS.RATINGS_LIST_ADMIN,
      data: ratings,
      total,
    };
  }

  async getLowRatedUsers(): Promise<{ message: string; data?: any[] }> {
    const profiles = await this.profileRepository
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('profile.ratingPromedio < :minRating', { minRating: 3 })
      .orWhere('profile.isBloqueadoPorRating = true')
      .getMany();

    const data = profiles.map((profile) => ({
      userId: profile.userId,
      publicId: profile.user?.publicId,
      email: profile.user?.email,
      alias: profile.user?.alias,
      rating: Number(profile.ratingPromedio),
      totalRatings: profile.totalCalificaciones,
      isBlocked: profile.isBloqueadoPorRating,
    }));

    return {
      message: ErrorMessages.RATINGS.LOW_RATED_USERS,
      data,
    };
  }
}
