import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';

import { Route } from './Models/route.entity';
import { RouteStop } from './Models/route-stop.entity';
import { CreateRouteDto, SearchRoutesDto, AddStopDto } from './Dto';
import { EstadoRutaEnum } from './Enums';
import { Driver } from '../drivers/Models/driver.entity';
import { Vehicle } from '../drivers/Models/vehicle.entity';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { UserProfile } from '../business/Models/user-profile.entity';
import { Booking } from '../bookings/Models/booking.entity';
import { EstadoReservaEnum } from '../bookings/Enums';
import { Payment } from '../payments/Models/payment.entity';
import { EstadoPagoEnum } from '../payments/Enums';
import { PaymentsService } from '../payments/payments.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import { buildIdWhere, generatePublicId } from '../common/utils/public-id.util';
import {
  haversineDistance,
  planStopInsertion,
} from '../common/utils/route-stop.util';
import { getDepartureDate } from '../common/utils/route-time.util';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(RouteStop)
    private readonly routeStopRepository: Repository<RouteStop>,
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(UserProfile)
    private readonly profileRepository: Repository<UserProfile>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
  ) {}

  private async ensureRouteAccess(
    route: Route,
    userId: string,
  ): Promise<void> {
    if (route.estado === EstadoRutaEnum.ACTIVA) {
      return;
    }

    if (route.driver?.userId && route.driver.userId === userId) {
      return;
    }

    const booking = await this.bookingRepository.findOne({
      where: { routeId: route.id, passengerId: userId },
    });

    if (!booking) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }
  }

  private async getApprovedDriver(userId: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({
      where: { userId },
    });

    if (!driver) {
      throw new ForbiddenException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    if (driver.estado !== EstadoConductorEnum.APROBADO) {
      throw new ForbiddenException(ErrorMessages.DRIVER.DRIVER_NOT_APPROVED);
    }

    return driver;
  }

  @Cron('*/5 * * * *')
  async autoFinalizeExpiredRoutes(): Promise<void> {
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const routes = await this.routeRepository.find({
        where: {
          estado: EstadoRutaEnum.ACTIVA,
          fecha: LessThanOrEqual(today),
        },
      });

      if (routes.length === 0) {
        return;
      }

      let finalized = 0;

      for (const route of routes) {
        const departure = getDepartureDate(route);
        if (!departure || departure.getTime() > now.getTime()) {
          continue;
        }

        const pendingCount = await this.bookingRepository.count({
          where: {
            routeId: route.id,
            estado: EstadoReservaEnum.CONFIRMADA,
          },
        });

        if (pendingCount > 0) {
          continue;
        }

        route.estado = EstadoRutaEnum.FINALIZADA;
        await this.routeRepository.save(route);
        finalized += 1;

        await this.auditService.logEvent({
          action: AuditAction.ROUTE_COMPLETED,
          result: AuditResult.SUCCESS,
          metadata: { routeId: route.id, reason: 'auto_finalize' },
        });
      }

      if (finalized > 0) {
        this.logger.log(`Auto-finalized routes: ${finalized}`);
      }
    } catch (error) {
      this.logger.error(
        `Auto-finalize routes failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async createRoute(
    userId: string,
    dto: CreateRouteDto,
    context?: AuthContext,
  ): Promise<{ message: string; routeId?: string }> {
    const driver = await this.getApprovedDriver(userId);

    const profile = await this.profileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    if (profile.isBloqueadoPorRating || Number(profile.ratingPromedio) < 3) {
      throw new ForbiddenException(ErrorMessages.ROUTES.DRIVER_BLOCKED_LOW_RATING);
    }

    const activeVehicle = await this.vehicleRepository.findOne({
      where: { driverId: driver.id, isActivo: true },
      order: { createdAt: 'DESC' },
    });

    if (!activeVehicle) {
      throw new BadRequestException(ErrorMessages.ROUTES.NO_ACTIVE_VEHICLE);
    }

    if (dto.asientosTotales > activeVehicle.asientosDisponibles) {
      throw new BadRequestException(ErrorMessages.ROUTES.SEATS_EXCEED_VEHICLE);
    }

    if (!dto.precioPasajero || dto.precioPasajero <= 0) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_PRICE_REQUIRED);
    }

    const stops = await Promise.all(
      dto.stops.map(async (stop, index) =>
        this.routeStopRepository.create({
          publicId: await generatePublicId(this.routeStopRepository, 'STP'),
          lat: stop.lat,
          lng: stop.lng,
          direccion: stop.direccion.trim(),
          orden: index + 1,
        }),
      ),
    );

    const route = this.routeRepository.create({
      publicId: await generatePublicId(this.routeRepository, 'RTE'),
      driverId: driver.id,
      origen: dto.origen,
      fecha: dto.fecha,
      horaSalida: dto.horaSalida,
      destinoBase: dto.destinoBase.trim(),
      asientosTotales: dto.asientosTotales,
      asientosDisponibles: dto.asientosTotales,
      precioPasajero: dto.precioPasajero,
      estado: EstadoRutaEnum.ACTIVA,
      mensaje: dto.mensaje?.trim() || null,
      stops,
    });

    const savedRoute = await this.routeRepository.save(route);

    await this.auditService.logEvent({
      action: AuditAction.ROUTE_CREATED,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { routeId: savedRoute.id },
    });

    return {
      message: ErrorMessages.ROUTES.ROUTE_CREATED,
      routeId: savedRoute.publicId,
    };
  }

  async getMyRoutes(
    userId: string,
    estado?: string,
  ): Promise<{ message: string; data?: Route[] }> {
    const driver = await this.driverRepository.findOne({
      where: { userId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    const whereClause: Record<string, unknown> = { driverId: driver.id };
    if (estado) {
      if (!Object.values(EstadoRutaEnum).includes(estado as EstadoRutaEnum)) {
        throw new BadRequestException(ErrorMessages.VALIDATION.INVALID_FORMAT('estado'));
      }
      whereClause.estado = estado;
    }

    const routes = await this.routeRepository.find({
      where: whereClause,
      relations: ['stops'],
      order: { createdAt: 'DESC' },
    });

    return {
      message: ErrorMessages.ROUTES.ROUTES_LIST_DRIVER,
      data: routes,
    };
  }

  async getAvailableRoutes(
    dto: SearchRoutesDto,
  ): Promise<{ message: string; data?: Route[] }> {
    const radiusKm = dto.radiusKm || 1;

    const whereClause: Record<string, unknown> = {
      estado: EstadoRutaEnum.ACTIVA,
      asientosDisponibles: MoreThan(0),
    };

    if (dto.fecha) {
      whereClause.fecha = dto.fecha;
    }

    const routes = await this.routeRepository.find({
      where: whereClause,
      relations: ['stops', 'driver', 'driver.user', 'driver.user.profile'],
    });

    const filtered = routes
      .map((route) => {
        const stops = route.stops || [];
        if (stops.length === 0) return null;

        const minDistance = Math.min(
          ...stops.map((stop) =>
            haversineDistance(
              dto.lat,
              dto.lng,
              Number(stop.lat),
              Number(stop.lng),
            ),
          ),
        );

        return minDistance <= radiusKm
          ? { route, distance: minDistance }
          : null;
      })
      .filter((item): item is { route: Route; distance: number } => item !== null)
      .sort((a, b) => a.distance - b.distance)
      .map((item) => item.route);

    return {
      message: ErrorMessages.ROUTES.ROUTES_LIST_AVAILABLE,
      data: filtered,
    };
  }

  async getRouteById(
    userId: string,
    routeId: string,
  ): Promise<{ message: string; data?: Route }> {
    const route = await this.routeRepository.findOne({
      where: buildIdWhere<Route>(routeId),
      relations: ['stops', 'driver', 'driver.user', 'driver.user.profile'],
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    await this.ensureRouteAccess(route, userId);

    return {
      message: ErrorMessages.ROUTES.ROUTE_DETAIL,
      data: route,
    };
  }

  async getRouteMap(
    userId: string,
    routeId: string,
  ): Promise<{ message: string; stops?: RouteStop[] }> {
    const route = await this.routeRepository.findOne({
      where: buildIdWhere<Route>(routeId),
      relations: ['driver'],
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    await this.ensureRouteAccess(route, userId);

    const stops = await this.routeStopRepository.find({
      where: { routeId: route.id },
      order: { orden: 'ASC' },
    });

    return {
      message: ErrorMessages.ROUTES.ROUTE_MAP,
      stops,
    };
  }

  async addRouteStop(
    userId: string,
    routeId: string,
    dto: AddStopDto,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.getApprovedDriver(userId);

    const routeWhere = buildIdWhere<Route>(routeId).map((where) => ({
      ...where,
      driverId: driver.id,
    }));

    const route = await this.routeRepository.findOne({
      where: routeWhere,
      relations: ['stops'],
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    if (route.estado !== EstadoRutaEnum.ACTIVA) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_NOT_ACTIVE);
    }

    const stops = (route.stops || []).sort((a, b) => a.orden - b.orden);
    const { newOrder, updates } = planStopInsertion(stops, dto.lat, dto.lng);

    if (updates.length > 0) {
      await this.routeStopRepository.save(updates);
    }

    const newStop = this.routeStopRepository.create({
      routeId: route.id,
      publicId: await generatePublicId(this.routeStopRepository, 'STP'),
      lat: dto.lat,
      lng: dto.lng,
      direccion: dto.direccion.trim(),
      orden: newOrder,
    });

    await this.routeStopRepository.save(newStop);

    await this.auditService.logEvent({
      action: AuditAction.ROUTE_UPDATED,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { routeId: route.id, stopId: newStop.id },
    });

    return {
      message: ErrorMessages.ROUTES.ROUTE_STOP_ADDED,
    };
  }

  async cancelRoute(
    userId: string,
    routeId: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.getApprovedDriver(userId);

    const route = await this.routeRepository.findOne({
      where: buildIdWhere<Route>(routeId).map((where) => ({
        ...where,
        driverId: driver.id,
      })),
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    if (route.estado !== EstadoRutaEnum.ACTIVA) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_NOT_ACTIVE);
    }

    route.estado = EstadoRutaEnum.CANCELADA;
    route.mensaje = ErrorMessages.ROUTES.ROUTE_CANCELLED;
    await this.routeRepository.save(route);

    await this.bookingRepository.update(
      { routeId: route.id, estado: In([EstadoReservaEnum.CONFIRMADA]) },
      { estado: EstadoReservaEnum.CANCELADA, cancelledAt: new Date() },
    );

    const payments = await this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoin('payment.booking', 'booking')
      .where('booking.routeId = :routeId', { routeId: route.id })
      .andWhere('payment.status IN (:...statuses)', {
        statuses: [EstadoPagoEnum.PAID, EstadoPagoEnum.PENDING],
      })
      .getMany();

    for (const payment of payments) {
      if (payment.status === EstadoPagoEnum.PAID) {
        try {
          await this.paymentsService.reversePayment(payment.id, userId, context);
        } catch {
          payment.status = EstadoPagoEnum.FAILED;
          payment.failureReason = 'Refund failed after route cancel';
          await this.paymentRepository.save(payment);
        }
      } else if (payment.status === EstadoPagoEnum.PENDING) {
        payment.status = EstadoPagoEnum.FAILED;
        payment.failureReason = 'Route cancelled';
        payment.reversedAt = new Date();
        await this.paymentRepository.save(payment);
      }
    }

    await this.auditService.logEvent({
      action: AuditAction.ROUTE_CANCELLED_DRIVER,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { routeId: route.id },
    });

    return {
      message: ErrorMessages.ROUTES.ROUTE_CANCELLED,
    };
  }

  async finalizeRoute(
    userId: string,
    routeId: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.getApprovedDriver(userId);

    const route = await this.routeRepository.findOne({
      where: buildIdWhere<Route>(routeId).map((where) => ({
        ...where,
        driverId: driver.id,
      })),
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    if (route.estado === EstadoRutaEnum.CANCELADA) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_NOT_ACTIVE);
    }

    const pendingBookings = await this.bookingRepository.find({
      where: {
        routeId: route.id,
        estado: EstadoReservaEnum.CONFIRMADA,
      },
    });

    if (pendingBookings.length > 0) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_NOT_FINISHED);
    }

    route.estado = EstadoRutaEnum.FINALIZADA;
    await this.routeRepository.save(route);

    await this.auditService.logEvent({
      action: AuditAction.ROUTE_COMPLETED,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { routeId: route.id },
    });

    return {
      message: ErrorMessages.ROUTES.ROUTE_FINALIZED,
    };
  }
}
