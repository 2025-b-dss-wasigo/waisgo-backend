/**
 * Servicio de negocio del modulo bookings.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomInt } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Booking } from './Models/booking.entity';
import { CreateBookingDto } from './Dto';
import { EstadoReservaEnum } from './Enums';
import { Route } from '../routes/Models/route.entity';
import { RouteStop } from '../routes/Models/route-stop.entity';
import { EstadoRutaEnum } from '../routes/Enums';
import { Driver } from '../drivers/Models/driver.entity';
import { EstadoConductorEnum } from '../drivers/Enums/estado-conductor.enum';
import { UserProfile } from '../business/Models/user-profile.entity';
import { Payment } from '../payments/Models/payment.entity';
import { EstadoPagoEnum, MetodoPagoEnum } from '../payments/Enums';
import { PaymentsService } from '../payments/payments.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import {
  buildIdWhere,
  generatePublicId,
  isUuid,
} from '../common/utils/public-id.util';
import { planStopInsertion } from '../common/utils/route-stop.util';
import { getDepartureDate } from '../common/utils/route-time.util';
import {
  decryptOtp,
  encryptOtp,
  secureCompare,
} from '../common/utils/otp-crypto.util';
import { StructuredLogger, SecurityEventType } from '../common/logger';
import { GoogleMapsService } from '../common/google-maps/google-maps.service';
import { MetricsService } from '../common/metrics/metrics.service';

type PickupDetails = {
  hasPickup: boolean;
  pickupLat?: number;
  pickupLng?: number;
  pickupDireccion?: string;
};

type BookingWithPayment = Booking & {
  paymentId?: string | null;
  paymentStatus?: EstadoPagoEnum | null;
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  private readonly OTP_VISIBLE_WINDOW_MS = 2 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(RouteStop)
    private readonly routeStopRepository: Repository<RouteStop>,
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(UserProfile)
    private readonly profileRepository: Repository<UserProfile>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly paymentsService: PaymentsService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly structuredLogger: StructuredLogger,
    private readonly googleMapsService: GoogleMapsService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Genera un OTP de 6 digitos usando criptografía segura
   */
  private generateOtp(): string {
    // randomInt es criptográficamente seguro (usa crypto.randomBytes internamente)
    return randomInt(100000, 1000000).toString();
  }

  private validatePickup(dto: CreateBookingDto): PickupDetails {
    const pickupLat = dto.pickupLat;
    const pickupLng = dto.pickupLng;
    const pickupDireccion = dto.pickupDireccion?.trim();

    const hasPickupLat = pickupLat !== undefined && pickupLat !== null;
    const hasPickupLng = pickupLng !== undefined && pickupLng !== null;
    const hasPickup = hasPickupLat || hasPickupLng || Boolean(pickupDireccion);

    if (!hasPickup) {
      return { hasPickup: false };
    }

    if (!hasPickupLat || !hasPickupLng) {
      throw new BadRequestException(
        ErrorMessages.VALIDATION.INVALID_FORMAT('pickupCoords'),
      );
    }

    if (!pickupDireccion) {
      throw new BadRequestException(
        ErrorMessages.VALIDATION.REQUIRED_FIELD('pickupDireccion'),
      );
    }

    return {
      hasPickup: true,
      pickupLat,
      pickupLng,
      pickupDireccion,
    };
  }

  private assertRouteIsBookable(route: Route): void {
    if (route.estado !== EstadoRutaEnum.ACTIVA) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_NOT_ACTIVE);
    }

    if (route.asientosDisponibles <= 0) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_FULL);
    }

    if (Number(route.precioPasajero) <= 0) {
      throw new BadRequestException(ErrorMessages.ROUTES.ROUTE_PRICE_REQUIRED);
    }
  }

  private getOtpSecret(): string {
    const secret =
      this.configService.get<string>('OTP_SECRET') ||
      this.configService.get<string>('JWT_SECRET');

    if (!secret) {
      throw new InternalServerErrorException(
        ErrorMessages.SYSTEM.INTERNAL_ERROR,
      );
    }

    return secret;
  }

  private normalizeOtpForResponse(booking: Booking): void {
    if (!booking?.otp) {
      return;
    }

    if (!this.isOtpVisible(booking)) {
      this.hideOtp(booking);
      return;
    }

    const secret = this.getOtpSecret();

    if (!secret) {
      this.hideOtp(booking);
      return;
    }

    const decrypted = decryptOtp(booking.otp, secret);
    booking.otp = decrypted ?? booking.otp;
  }

  private isOtpVisible(booking: Booking): boolean {
    const allowedStates = [
      EstadoReservaEnum.CONFIRMADA,
      EstadoReservaEnum.COMPLETADA,
    ];

    if (!allowedStates.includes(booking.estado)) {
      return false;
    }

    const departure = getDepartureDate(booking.route);

    if (!departure) {
      return true;
    }

    const expiresAt = departure.getTime() + this.OTP_VISIBLE_WINDOW_MS;
    return Date.now() <= expiresAt;
  }

  private hideOtp(booking: Booking): void {
    const subject = booking as Partial<Pick<Booking, 'otp'>> &
      Omit<Booking, 'otp'>;
    delete subject.otp;
  }

  private isOtpMatch(storedOtp: string, providedOtp: string): boolean {
    const secret = this.getOtpSecret();
    const normalizedProvided = providedOtp.trim();

    if (!secret) {
      return false;
    }

    const decrypted = decryptOtp(storedOtp, secret);
    const candidate = decrypted ?? storedOtp;

    return secureCompare(candidate, normalizedProvided);
  }

  private async insertPickupStop(
    stopRepo: Repository<RouteStop>,
    routeId: string,
    pickup: PickupDetails,
  ): Promise<RouteStop | null> {
    if (
      !pickup.hasPickup ||
      pickup.pickupLat === undefined ||
      pickup.pickupLng === undefined ||
      !pickup.pickupDireccion
    ) {
      return null;
    }

    const stops = await stopRepo.find({
      where: { routeId },
      order: { orden: 'ASC' },
    });

    const { newOrder, updates } = planStopInsertion(
      stops,
      pickup.pickupLat,
      pickup.pickupLng,
    );

    if (updates.length > 0) {
      await stopRepo.save(updates);
    }

    const newStop = stopRepo.create({
      routeId,
      publicId: await generatePublicId(stopRepo, 'STP'),
      lat: pickup.pickupLat,
      lng: pickup.pickupLng,
      direccion: pickup.pickupDireccion,
      orden: newOrder,
    });

    await stopRepo.save(newStop);

    return newStop;
  }

  private async createBookingTransaction(
    manager: EntityManager,
    passengerId: string,
    dto: CreateBookingDto,
    pickup: PickupDetails,
  ): Promise<{
    bookingId: string;
    bookingPublicId: string;
    otp: string;
    routeId: string;
    pickupStopId?: string;
  }> {
    const routeRepo = manager.getRepository(Route);
    const bookingRepo = manager.getRepository(Booking);
    const stopRepo = manager.getRepository(RouteStop);

    const route = await routeRepo.findOne({
      where: buildIdWhere<Route>(dto.routeId),
      lock: { mode: 'pessimistic_write' },
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    this.assertRouteIsBookable(route);

    const existing = await bookingRepo.findOne({
      where: { routeId: route.id, passengerId },
    });

    if (existing) {
      throw new BadRequestException(ErrorMessages.BOOKINGS.ALREADY_BOOKED);
    }

    const generatedOtp = this.generateOtp();

    const booking = bookingRepo.create({
      publicId: await generatePublicId(bookingRepo, 'BKG'),
      routeId: route.id,
      passengerId,
      estado: EstadoReservaEnum.CONFIRMADA,
      otp: encryptOtp(generatedOtp, this.getOtpSecret()),
      otpUsado: false,
      metodoPago: dto.metodoPago,
    });

    const savedBooking = await bookingRepo.save(booking);

    route.asientosDisponibles = Math.max(route.asientosDisponibles - 1, 0);
    await routeRepo.save(route);

      const pickupStop = await this.insertPickupStop(stopRepo, route.id, pickup);
      if (pickupStop) {
        savedBooking.pickupStopId = pickupStop.id;
        await bookingRepo.save(savedBooking);
      }

      return {
        bookingId: savedBooking.id,
        bookingPublicId: savedBooking.publicId,
        otp: generatedOtp,
        routeId: route.id,
        pickupStopId: pickupStop?.id,
      };
    }

  private async finalizeRouteIfReady(
    routeId: string,
    driverUserId?: string,
    context?: AuthContext,
  ): Promise<void> {
    const pendingCount = await this.bookingRepository.count({
      where: { routeId, estado: EstadoReservaEnum.CONFIRMADA },
    });

    if (pendingCount > 0) {
      return;
    }

    const route = await this.routeRepository.findOne({
      where: { id: routeId },
    });

    if (!route || route.estado !== EstadoRutaEnum.ACTIVA) {
      return;
    }

    route.estado = EstadoRutaEnum.FINALIZADA;
    await this.routeRepository.save(route);
    this.metricsService?.routesEventsTotal.labels('finalized_auto').inc();

    await this.auditService.logEvent({
      action: AuditAction.ROUTE_COMPLETED,
      userId: driverUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { routeId },
    });
  }

  private async getApprovedDriver(businessUserId: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({
      where: { businessUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

    if (driver.estado !== EstadoConductorEnum.APROBADO) {
      throw new ForbiddenException(ErrorMessages.DRIVER.DRIVER_NOT_APPROVED);
    }

    return driver;
  }

  /**
   * Crear una reserva
   */
  async createBooking(
    passengerId: string,
    dto: CreateBookingDto,
    context?: AuthContext,
  ): Promise<{ message: string; bookingId?: string; otp?: string }> {
    const profile = await this.profileRepository.findOne({
      where: { businessUserId: passengerId },
    });

    if (!profile) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    if (profile.isBloqueadoPorRating || Number(profile.ratingPromedio) < 3) {
      throw new ForbiddenException(
        ErrorMessages.BOOKINGS.PASSENGER_BLOCKED_LOW_RATING,
      );
    }

    const debtCount = await this.bookingRepository.count({
      where: {
        passengerId,
        metodoPago: MetodoPagoEnum.EFECTIVO,
        estado: EstadoReservaEnum.NO_SHOW,
      },
    });

    if (debtCount > 0) {
      throw new BadRequestException(ErrorMessages.BOOKINGS.PASSENGER_HAS_DEBT);
    }

    const pickup = this.validatePickup(dto);

    const result = await this.bookingRepository.manager.transaction((manager) =>
      this.createBookingTransaction(manager, passengerId, dto, pickup),
    );

      const {
        bookingId,
        bookingPublicId,
        otp,
        routeId: routeInternalId,
        pickupStopId,
      } = result;

      if (pickupStopId) {
        try {
          await this.refreshRoutePolyline(routeInternalId ?? dto.routeId);
        } catch (error) {
          this.logger.error(
            `Failed to refresh route polyline after booking: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
        }
      }

      await this.auditService.logEvent({
        action: AuditAction.BOOKING_CREATED,
        userId: passengerId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: {
        bookingId,
        routeId: routeInternalId ?? dto.routeId,
        metodoPago: dto.metodoPago,
      },
    });

    await this.auditService.logEvent({
      action: AuditAction.TRIP_OTP_GENERATED,
      userId: passengerId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { bookingId },
    });

    this.structuredLogger.logSuccess(
      SecurityEventType.BOOKING_CREATE,
      'Booking creation',
      passengerId,
      `booking:${bookingPublicId}`,
      {
        routeId: dto.routeId,
        metodoPago: dto.metodoPago,
      },
    );

    this.logger.log(`Booking created: ${bookingId} for route ${dto.routeId}`);
    this.metricsService?.bookingsEventsTotal.labels('created').inc();

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_CREATED,
      bookingId: bookingPublicId,
      otp,
    };
  }

  /**
   * Obtener reservas del pasajero
   */
  async getMyBookings(
    passengerId: string,
    estado?: string,
  ): Promise<{ message: string; data?: BookingWithPayment[] }> {
    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.route', 'route')
      .leftJoinAndSelect('route.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'driverUser')
      .leftJoinAndSelect('driverUser.profile', 'driverProfile')
      .leftJoin(Payment, 'payment', 'payment.bookingId = booking.id')
      .where('booking.passengerId = :passengerId', { passengerId })
      .orderBy('booking.createdAt', 'DESC');
    query.addSelect('booking.otp');
    query.addSelect('payment.publicId', 'payment_publicId');
    query.addSelect('payment.status', 'payment_status');

    if (estado) {
      if (
        !Object.values(EstadoReservaEnum).includes(estado as EstadoReservaEnum)
      ) {
        throw new BadRequestException(
          ErrorMessages.VALIDATION.INVALID_FORMAT('estado'),
        );
      }
      query.andWhere('booking.estado = :estado', { estado });
    }

    const { entities, raw } = await query.getRawAndEntities();
    const mapped = entities.map((booking, index) => {
      const row = raw[index] ?? {};
      const paymentId =
        typeof row.payment_publicId === 'string' ? row.payment_publicId : null;
      const paymentStatus = row.payment_status ?? null;
      const enriched = booking as BookingWithPayment;
      enriched.paymentId = paymentId;
      enriched.paymentStatus = paymentStatus;
      return enriched;
    });

    mapped.forEach((booking) => this.normalizeOtpForResponse(booking));

    return {
      message: ErrorMessages.BOOKINGS.BOOKINGS_LIST,
      data: mapped,
    };
  }

  /**
   * Obtener detalle de una reserva
   */
  async getBookingById(
    passengerId: string,
    bookingId: string,
  ): Promise<{ message: string; data?: BookingWithPayment }> {
    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.route', 'route')
      .leftJoinAndSelect('route.stops', 'stops')
      .leftJoinAndSelect('route.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'driverUser')
      .leftJoinAndSelect('driverUser.profile', 'driverProfile')
      .leftJoin(Payment, 'payment', 'payment.bookingId = booking.id')
      .addSelect('booking.otp');
    query.addSelect('payment.publicId', 'payment_publicId');
    query.addSelect('payment.status', 'payment_status');

    // Use UUID lookup only when identifier is a valid UUID to avoid type mismatch
    if (isUuid(bookingId)) {
      query.where('booking.id = :bookingId OR booking.publicId = :bookingId', {
        bookingId,
      });
    } else {
      query.where('booking.publicId = :bookingId', { bookingId });
    }

    const { entities, raw } = await query.getRawAndEntities();
    const booking = entities[0];

    if (booking?.passengerId !== passengerId) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    if (booking) {
      const row = raw[0] ?? {};
      const paymentId =
        typeof row.payment_publicId === 'string' ? row.payment_publicId : null;
      const paymentStatus = row.payment_status ?? null;
      const enriched = booking as BookingWithPayment;
      enriched.paymentId = paymentId;
      enriched.paymentStatus = paymentStatus;
      this.normalizeOtpForResponse(booking);
    }

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_DETAIL,
      data: booking,
    };
  }

  /**
   * Verifica si una reserva es elegible para reembolso (>1h antes de salida)
   */
  private isEligibleForRefund(route: Route): boolean {
    const departure = getDepartureDate(route);
    if (!departure) return true;
    const diffMs = departure.getTime() - Date.now();
    return diffMs >= 60 * 60 * 1000;
  }

  /**
   * Procesa el reembolso de un pago si es elegible
   */
  private async processRefundIfEligible(
    payment: Payment | null,
    passengerId: string,
    eligibleForRefund: boolean,
    context?: AuthContext,
  ): Promise<void> {
    if (!payment) return;

    if (payment.status === EstadoPagoEnum.PAID) {
      if (eligibleForRefund) {
        try {
          await this.paymentsService.reversePayment(
            payment.id,
            passengerId,
            context,
          );
        } catch (error) {
          payment.status = EstadoPagoEnum.FAILED;
          payment.failureReason =
            error instanceof Error ? error.message : 'Refund failed';
          await this.paymentRepository.save(payment);
        }
      } else {
        payment.failureReason = 'Late cancellation - no refund';
        await this.paymentRepository.save(payment);
      }
    } else if (payment.status === EstadoPagoEnum.PENDING) {
      payment.status = EstadoPagoEnum.FAILED;
      payment.failureReason = 'Booking cancelled';
      payment.reversedAt = new Date();
      await this.paymentRepository.save(payment);
    }
  }

  /**
   * Cancelar una reserva
   */
  async cancelBooking(
    passengerId: string,
    bookingId: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const booking = await this.bookingRepository.findOne({
      where: buildIdWhere<Booking>(bookingId),
      relations: ['route'],
    });

    if (booking?.passengerId !== passengerId) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    if (booking.estado !== EstadoReservaEnum.CONFIRMADA) {
      throw new BadRequestException(ErrorMessages.BOOKINGS.BOOKING_NOT_ACTIVE);
    }

    const eligibleForRefund = this.isEligibleForRefund(booking.route);

    await this.bookingRepository.manager.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(Booking);
      const routeRepo = manager.getRepository(Route);

      await bookingRepo.update(
        { id: booking.id },
        { estado: EstadoReservaEnum.CANCELADA, cancelledAt: new Date() },
      );

      const route = await routeRepo.findOne({
        where: { id: booking.routeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (route) {
        route.asientosDisponibles = Math.min(
          route.asientosTotales,
          route.asientosDisponibles + 1,
        );
        await routeRepo.save(route);
      }
    });

    const payment = await this.paymentRepository.findOne({
      where: { bookingId: booking.id },
    });

    await this.processRefundIfEligible(
      payment,
      passengerId,
      eligibleForRefund,
      context,
    );

    await this.auditService.logEvent({
      action: AuditAction.BOOKING_CANCELLED_PASSENGER,
      userId: passengerId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { bookingId: booking.id, routeId: booking.routeId },
    });

    this.structuredLogger.logSuccess(
      SecurityEventType.BOOKING_CANCEL,
      'Booking cancellation',
      passengerId,
      `booking:${booking.publicId}`,
      {
        routeId: booking.routeId,
        eligibleForRefund,
        paymentId: payment?.id,
      },
    );

    this.logger.log(`Booking cancelled: ${booking.id}`);
    this.metricsService?.bookingsEventsTotal.labels('cancelled').inc();

    return {
      message: eligibleForRefund
        ? ErrorMessages.BOOKINGS.CANCELLATION_SUCCESS
        : ErrorMessages.BOOKINGS.NO_REFUND,
    };
  }

  /**
   * Obtener mapa de la ruta (solo si booking activo)
   */
  async getBookingMap(
    passengerId: string,
    bookingId: string,
  ): Promise<{ message: string; stops?: RouteStop[]; polyline?: string | null }> {
    const booking = await this.bookingRepository.findOne({
      where: buildIdWhere<Booking>(bookingId),
    });

    if (booking?.passengerId !== passengerId) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    if (booking.estado !== EstadoReservaEnum.CONFIRMADA) {
      throw new ForbiddenException(ErrorMessages.BOOKINGS.BOOKING_NOT_ACTIVE);
    }

    const stops = await this.routeStopRepository.find({
      where: { routeId: booking.routeId },
      order: { orden: 'ASC' },
    });

    const route = await this.routeRepository.findOne({
      where: { id: booking.routeId },
    });

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_MAP,
      stops,
      polyline: route?.polyline ?? null,
    };
  }

  /**
   * Obtener pasajeros de una ruta (para conductor)
   */
  async getBookingsByRoute(
    driverUserId: string,
    routeId: string,
  ): Promise<{ message: string; data?: Booking[] }> {
    const driver = await this.getApprovedDriver(driverUserId);

    const route = await this.routeRepository.findOne({
      where: buildIdWhere<Route>(routeId).map((where) => ({
        ...where,
        driverId: driver.id,
      })),
    });

    if (!route) {
      throw new NotFoundException(ErrorMessages.ROUTES.ROUTE_NOT_FOUND);
    }

    const bookings = await this.bookingRepository.find({
      where: { routeId: route.id, estado: EstadoReservaEnum.CONFIRMADA },
      relations: ['passenger', 'passenger.profile'],
      order: { createdAt: 'ASC' },
    });

    return {
      message: ErrorMessages.BOOKINGS.BOOKINGS_ROUTE_LIST,
      data: bookings,
    };
  }

  /**
   * Marcar pasajero como llegado (completar booking)
   */
  async completeBooking(
    driverUserId: string,
    bookingId: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.getApprovedDriver(driverUserId);

    const booking = await this.bookingRepository.findOne({
      where: buildIdWhere<Booking>(bookingId),
      relations: ['route'],
    });

    if (!booking) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    if (booking.route?.driverId !== driver.id) {
      throw new ForbiddenException(ErrorMessages.SYSTEM.FORBIDDEN);
    }

    if (booking.estado !== EstadoReservaEnum.CONFIRMADA) {
      throw new BadRequestException(ErrorMessages.BOOKINGS.BOOKING_NOT_ACTIVE);
    }

    if (!booking.otpUsado) {
      throw new BadRequestException(ErrorMessages.TRIP_OTP.OTP_NOT_FOUND);
    }

    booking.estado = EstadoReservaEnum.COMPLETADA;
    await this.bookingRepository.save(booking);

    await this.finalizeRouteIfReady(booking.routeId, driverUserId, context);

    this.logger.log(`Booking completed: ${bookingId}`);
    this.metricsService?.bookingsEventsTotal.labels('completed').inc();

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_COMPLETED,
    };
  }

  /**
   * Marcar pasajero como NO_SHOW
   */
  async markNoShow(
    driverUserId: string,
    bookingId: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.getApprovedDriver(driverUserId);

    const booking = await this.bookingRepository.findOne({
      where: buildIdWhere<Booking>(bookingId),
      relations: ['route'],
    });

    if (!booking) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    if (booking.route?.driverId !== driver.id) {
      throw new ForbiddenException(ErrorMessages.SYSTEM.FORBIDDEN);
    }

    if (booking.estado !== EstadoReservaEnum.CONFIRMADA) {
      throw new BadRequestException(ErrorMessages.BOOKINGS.BOOKING_NOT_ACTIVE);
    }

    const departure = getDepartureDate(booking.route);
    if (departure) {
      const diffMs = Date.now() - departure.getTime();
      if (diffMs < 30 * 60 * 1000) {
        throw new BadRequestException(ErrorMessages.BOOKINGS.NO_SHOW_TOO_EARLY);
      }
    }

    booking.estado = EstadoReservaEnum.NO_SHOW;
    await this.bookingRepository.save(booking);

    if (booking.pickupStopId) {
      await this.removePickupStop(booking.routeId, booking.pickupStopId);
    }

    await this.finalizeRouteIfReady(booking.routeId, driverUserId, context);

    const payment = await this.paymentRepository.findOne({
      where: { bookingId: booking.id },
    });

    if (payment && payment.status === EstadoPagoEnum.PENDING) {
      payment.status = EstadoPagoEnum.FAILED;
      payment.failureReason = 'No show';
      await this.paymentRepository.save(payment);
    }

    await this.auditService.logEvent({
      action: AuditAction.BOOKING_NO_SHOW,
      userId: driverUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { bookingId: booking.id, routeId: booking.routeId },
    });

    this.logger.log(`Booking marked as no show: ${booking.id}`);
    this.metricsService?.bookingsEventsTotal.labels('no_show').inc();

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_NO_SHOW,
    };
  }

  private async refreshRoutePolyline(routeId: string): Promise<void> {
    const stops = await this.routeStopRepository.find({
      where: { routeId },
      order: { orden: 'ASC' },
    });

    if (stops.length < 2) {
      await this.routeRepository.update(routeId, { polyline: null });
      return;
    }

    const polyline = await this.googleMapsService.buildRoutePolyline(
      stops.map((stop) => ({ lat: Number(stop.lat), lng: Number(stop.lng) })),
    );
    await this.routeRepository.update(routeId, { polyline });
  }

  private async removePickupStop(
    routeId: string,
    pickupStopId: string,
  ): Promise<void> {
    const stop = await this.routeStopRepository.findOne({
      where: { id: pickupStopId, routeId },
    });

    if (!stop) {
      return;
    }

    await this.routeStopRepository.delete({ id: pickupStopId });

    const remaining = await this.routeStopRepository.find({
      where: { routeId },
      order: { orden: 'ASC' },
    });

    const updates = remaining
      .filter((item) => item.orden > stop.orden)
      .map((item) => ({ ...item, orden: item.orden - 1 }));

    if (updates.length > 0) {
      await this.routeStopRepository.save(updates);
    }

    try {
      await this.refreshRoutePolyline(routeId);
    } catch (error) {
      this.logger.error(
        `Failed to refresh route polyline after stop removal: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  /**
   * Verificar OTP del pasajero
   */
  async verifyOtp(
    driverUserId: string,
    bookingId: string,
    otp: string,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const driver = await this.getApprovedDriver(driverUserId);

    const idPredicates = buildIdWhere<Booking>(bookingId);
    const bookingQuery = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.route', 'route')
      .addSelect('booking.otp');

    idPredicates.forEach((predicate, index) => {
      const column = Object.keys(predicate)[0];
      const paramKey = `${column}${index}`;
      const params = {
        [paramKey]: predicate[column as keyof typeof predicate],
      };
      if (index === 0) {
        bookingQuery.where(`booking.${column} = :${paramKey}`, params);
      } else {
        bookingQuery.orWhere(`booking.${column} = :${paramKey}`, params);
      }
    });

    const booking = await bookingQuery.getOne();

    if (!booking) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    if (booking.route?.driverId !== driver.id) {
      throw new ForbiddenException(ErrorMessages.SYSTEM.FORBIDDEN);
    }

    if (booking.estado !== EstadoReservaEnum.CONFIRMADA) {
      throw new BadRequestException(ErrorMessages.BOOKINGS.BOOKING_NOT_ACTIVE);
    }

    if (booking.otpUsado) {
      throw new BadRequestException(ErrorMessages.TRIP_OTP.OTP_ALREADY_USED);
    }

    if (!this.isOtpMatch(booking.otp, otp)) {
      await this.auditService.logEvent({
        action: AuditAction.TRIP_OTP_INVALID,
        userId: driverUserId,
        result: AuditResult.FAILED,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
        metadata: { bookingId, routeId: booking.routeId },
      });

      throw new BadRequestException(ErrorMessages.TRIP_OTP.OTP_INVALID);
    }

    booking.otpUsado = true;
    await this.bookingRepository.save(booking);

    await this.auditService.logEvent({
      action: AuditAction.TRIP_OTP_VALIDATED,
      userId: driverUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { bookingId: booking.id, routeId: booking.routeId },
    });

    this.logger.log(`OTP validated for booking: ${booking.id}`);
    this.metricsService?.bookingsEventsTotal.labels('otp_verified').inc();

    return {
      message: ErrorMessages.TRIP_OTP.TRIP_STARTED,
    };
  }
}
