import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { randomInt } from 'node:crypto';
import { Booking } from './Models/booking.entity';
import { CreateBookingDto } from './Dto';
import { EstadoReservaEnum } from './Enums';
import { Route } from '../routes/Models/route.entity';
import { RouteStop } from '../routes/Models/route-stop.entity';
import { EstadoRutaEnum } from '../routes/Enums';
import { Driver } from '../drivers/Models/driver.entity';
import { UserProfile } from '../business/Models/user-profile.entity';
import { Payment } from '../payments/Models/payment.entity';
import { EstadoPagoEnum, MetodoPagoEnum } from '../payments/Enums';
import { PaymentsService } from '../payments/payments.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import { buildIdWhere, generatePublicId } from '../common/utils/public-id.util';
import { planStopInsertion } from '../common/utils/route-stop.util';
import { getDepartureDate } from '../common/utils/route-time.util';

type PickupDetails = {
  hasPickup: boolean;
  pickupLat?: number;
  pickupLng?: number;
  pickupDireccion?: string;
};

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

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

  private async insertPickupStop(
    stopRepo: Repository<RouteStop>,
    routeId: string,
    pickup: PickupDetails,
  ): Promise<void> {
    if (
      !pickup.hasPickup ||
      pickup.pickupLat === undefined ||
      pickup.pickupLng === undefined ||
      !pickup.pickupDireccion
    ) {
      return;
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
      otp: generatedOtp,
      otpUsado: false,
      metodoPago: dto.metodoPago,
    });

    const savedBooking = await bookingRepo.save(booking);

    route.asientosDisponibles = Math.max(route.asientosDisponibles - 1, 0);
    await routeRepo.save(route);

    await this.insertPickupStop(stopRepo, route.id, pickup);

    return {
      bookingId: savedBooking.id,
      bookingPublicId: savedBooking.publicId,
      otp: generatedOtp,
      routeId: route.id,
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

    await this.auditService.logEvent({
      action: AuditAction.ROUTE_COMPLETED,
      userId: driverUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { routeId },
    });
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
      where: { userId: passengerId },
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

    const { bookingId, bookingPublicId, otp, routeId: routeInternalId } = result;

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

    this.logger.log(`Booking created: ${bookingId} for route ${dto.routeId}`);

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
  ): Promise<{ message: string; data?: Booking[] }> {
    const query = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.route', 'route')
      .leftJoinAndSelect('route.driver', 'driver')
      .leftJoinAndSelect('driver.user', 'driverUser')
      .leftJoinAndSelect('driverUser.profile', 'driverProfile')
      .where('booking.passengerId = :passengerId', { passengerId })
      .orderBy('booking.createdAt', 'DESC');

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

    const bookings = await query.getMany();

    return {
      message: ErrorMessages.BOOKINGS.BOOKINGS_LIST,
      data: bookings,
    };
  }

  /**
   * Obtener detalle de una reserva
   */
  async getBookingById(
    passengerId: string,
    bookingId: string,
  ): Promise<{ message: string; data?: Booking }> {
    const booking = await this.bookingRepository.findOne({
      where: buildIdWhere<Booking>(bookingId),
      relations: [
        'route',
        'route.stops',
        'route.driver',
        'route.driver.user',
        'route.driver.user.profile',
      ],
    });

    if (booking?.passengerId !== passengerId) {
      throw new NotFoundException(ErrorMessages.BOOKINGS.BOOKING_NOT_FOUND);
    }

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_DETAIL,
      data: booking,
    };
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

    const departure = getDepartureDate(booking.route);
    if (departure) {
      const diffMs = departure.getTime() - Date.now();
      if (diffMs < 60 * 60 * 1000) {
        throw new BadRequestException(
          ErrorMessages.BOOKINGS.CANCELLATION_TOO_LATE,
        );
      }
    }

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

    if (payment && payment.status === EstadoPagoEnum.PAID) {
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
    } else if (payment && payment.status === EstadoPagoEnum.PENDING) {
      payment.status = EstadoPagoEnum.FAILED;
      payment.failureReason = 'Booking cancelled';
      payment.reversedAt = new Date();
      await this.paymentRepository.save(payment);
    }

    await this.auditService.logEvent({
      action: AuditAction.BOOKING_CANCELLED_PASSENGER,
      userId: passengerId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { bookingId: booking.id, routeId: booking.routeId },
    });

    this.logger.log(`Booking cancelled: ${booking.id}`);

    return {
      message: ErrorMessages.BOOKINGS.CANCELLATION_SUCCESS,
    };
  }

  /**
   * Obtener mapa de la ruta (solo si booking activo)
   */
  async getBookingMap(
    passengerId: string,
    bookingId: string,
  ): Promise<{ message: string; stops?: RouteStop[] }> {
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

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_MAP,
      stops,
    };
  }

  /**
   * Obtener pasajeros de una ruta (para conductor)
   */
  async getBookingsByRoute(
    driverUserId: string,
    routeId: string,
  ): Promise<{ message: string; data?: Booking[] }> {
    const driver = await this.driverRepository.findOne({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

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
    const driver = await this.driverRepository.findOne({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

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
    const driver = await this.driverRepository.findOne({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

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

    return {
      message: ErrorMessages.BOOKINGS.BOOKING_NO_SHOW,
    };
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
    const driver = await this.driverRepository.findOne({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new NotFoundException(ErrorMessages.DRIVER.NOT_A_DRIVER);
    }

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

    if (booking.otpUsado) {
      throw new BadRequestException(ErrorMessages.TRIP_OTP.OTP_ALREADY_USED);
    }

    if (booking.otp !== otp) {
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

    return {
      message: ErrorMessages.TRIP_OTP.TRIP_STARTED,
    };
  }
}
