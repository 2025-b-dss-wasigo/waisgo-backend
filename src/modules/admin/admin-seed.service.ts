/**
 * Servicio de negocio del modulo admin.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';

import { BusinessUser } from '../business/Models/business-user.entity';
import { UserProfile } from '../business/Models/user-profile.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { DriverDocument } from '../drivers/Models/driver-document.entity';
import { Vehicle } from '../drivers/Models/vehicle.entity';
import { Route } from '../routes/Models/route.entity';
import { RouteStop } from '../routes/Models/route-stop.entity';
import { Booking } from '../bookings/Models/booking.entity';
import { Payment } from '../payments/Models/payment.entity';
import { Payout } from '../payments/Models/payout.entity';
import { Rating } from '../ratings/Models/rating.entity';
import { AuthUser } from '../auth/Models/auth-user.entity';
import { EstadoVerificacionEnum, RolUsuarioEnum } from '../auth/Enum';
import {
  EstadoConductorEnum,
  EstadoDocumentoEnum,
  TipoDocumentoEnum,
} from '../drivers/Enums';
import { CampusOrigenEnum, EstadoRutaEnum } from '../routes/Enums';
import { EstadoReservaEnum } from '../bookings/Enums';
import {
  EstadoPagoEnum,
  MetodoPagoEnum,
  EstadoPayoutEnum,
} from '../payments/Enums';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import type { AuthContext } from '../common/types';
import { generatePublicId } from '../common/utils/public-id.util';
import { IdentityResolverService } from '../identity';

type SeedResult = {
  message: string;
  data?: Record<string, unknown>;
};

@Injectable()
export class AdminSeedService {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    @InjectRepository(BusinessUser)
    private readonly businessUserRepo: Repository<BusinessUser>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly identityResolver: IdentityResolverService,
  ) {}

  private getPeriod(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private getDateString(date: Date, offsetDays: number): string {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + offsetDays);
    return next.toISOString().slice(0, 10);
  }

  async seedDatabase(
    adminUserId: string,
    context?: AuthContext,
  ): Promise<SeedResult> {
    const seedEmail = 'seed.driver1@epn.edu.ec';
    const seedAlias = 'seed_driver_1';
    const existing = await this.businessUserRepo.findOne({
      where: { alias: seedAlias },
    });

    if (existing) {
      return { message: ErrorMessages.ADMIN.SEED_ALREADY_RUN };
    }

    const seedPassword = 'Seed.123';
    const passwordHash = await bcrypt.hash(seedPassword, 12);

    const driverOneEmail = seedEmail;
    const driverTwoEmail = 'seed.driver2@epn.edu.ec';
    const driverThreeEmail = 'seed.driver3@epn.edu.ec';
    const passengerOneEmail = 'seed.passenger1@epn.edu.ec';
    const passengerTwoEmail = 'seed.passenger2@epn.edu.ec';
    const passengerThreeEmail = 'seed.passenger3@epn.edu.ec';
    const passengerFourEmail = 'seed.passenger4@epn.edu.ec';
    const passengerFiveEmail = 'seed.passenger5@epn.edu.ec';
    const passengerSixEmail = 'seed.passenger6@epn.edu.ec';
    const adminEmail = 'seed.admin@epn.edu.ec';
    const userEmail = 'seed.user@epn.edu.ec';

    const now = new Date();
    const today = this.getDateString(now, 0);
    const tomorrow = this.getDateString(now, 1);
    const yesterday = this.getDateString(now, -1);
    const period = this.getPeriod(now);

    const driverOneId = randomUUID();
    const driverTwoId = randomUUID();
    const driverThreeId = randomUUID();
    const passengerOneId = randomUUID();
    const passengerTwoId = randomUUID();
    const passengerThreeId = randomUUID();
    const passengerFourId = randomUUID();
    const passengerFiveId = randomUUID();
    const passengerSixId = randomUUID();
    const adminId = randomUUID();
    const userId = randomUUID();

    const result = await this.dataSource.transaction(async (manager) => {
      const businessRepo = manager.getRepository(BusinessUser);
      const profileRepo = manager.getRepository(UserProfile);
      const driverRepo = manager.getRepository(Driver);
      const documentRepo = manager.getRepository(DriverDocument);
      const vehicleRepo = manager.getRepository(Vehicle);
      const routeRepo = manager.getRepository(Route);
      const routeStopRepo = manager.getRepository(RouteStop);
      const bookingRepo = manager.getRepository(Booking);
      const paymentRepo = manager.getRepository(Payment);
      const payoutRepo = manager.getRepository(Payout);
      const ratingRepo = manager.getRepository(Rating);
      const authRepo = manager.getRepository(AuthUser);

      const createStops = async (lat: number, lng: number, label: string) => [
        routeStopRepo.create({
          publicId: await generatePublicId(routeStopRepo, 'STP'),
          lat,
          lng,
          direccion: `${label} Stop 1`,
          orden: 1,
        }),
        routeStopRepo.create({
          publicId: await generatePublicId(routeStopRepo, 'STP'),
          lat: lat + 0.002,
          lng: lng + 0.002,
          direccion: `${label} Stop 2`,
          orden: 2,
        }),
      ];

      const authUsers = [
        authRepo.create({
          id: driverOneId,
          email: driverOneEmail,
          rol: RolUsuarioEnum.CONDUCTOR,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: driverTwoId,
          email: driverTwoEmail,
          rol: RolUsuarioEnum.CONDUCTOR,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: driverThreeId,
          email: driverThreeEmail,
          rol: RolUsuarioEnum.CONDUCTOR,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: passengerOneId,
          email: passengerOneEmail,
          rol: RolUsuarioEnum.PASAJERO,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: passengerTwoId,
          email: passengerTwoEmail,
          rol: RolUsuarioEnum.PASAJERO,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: passengerThreeId,
          email: passengerThreeEmail,
          rol: RolUsuarioEnum.PASAJERO,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: passengerFourId,
          email: passengerFourEmail,
          rol: RolUsuarioEnum.PASAJERO,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: passengerFiveId,
          email: passengerFiveEmail,
          rol: RolUsuarioEnum.PASAJERO,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: passengerSixId,
          email: passengerSixEmail,
          rol: RolUsuarioEnum.PASAJERO,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: adminId,
          email: adminEmail,
          rol: RolUsuarioEnum.ADMIN,
          estadoVerificacion: EstadoVerificacionEnum.VERIFICADO,
          credential: { passwordHash },
        }),
        authRepo.create({
          id: userId,
          email: userEmail,
          rol: RolUsuarioEnum.USER,
          estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
          credential: { passwordHash },
        }),
      ];

      await authRepo.save(authUsers);

      // Helper to create and save a business user with profile and identity mapping
      const createBusinessUser = async (
        authId: string,
        email: string,
        alias: string,
        profileData: Partial<UserProfile>,
      ): Promise<BusinessUser> => {
        const businessUser = await businessRepo.save(
          businessRepo.create({
            publicId: await generatePublicId(businessRepo, 'USR'),
            alias,
          }),
        );

        // Create profile with generated businessUserId
        await profileRepo.save(
          profileRepo.create({
            businessUserId: businessUser.id,
            ...profileData,
          }),
        );

        // Create identity mapping
        await this.identityResolver.createMappingWithManager(
          manager,
          authId,
          businessUser.id,
          { email, createdAt: now },
        );

        return businessUser;
      };

      const businessUserDriverOne = await createBusinessUser(
        driverOneId,
        driverOneEmail,
        seedAlias,
        {
          nombre: 'Seed',
          apellido: 'Driver1',
          celular: '0999999901',
          ratingPromedio: 4.6,
          totalViajes: 5,
          totalCalificaciones: 5,
        },
      );

      const businessUserDriverTwo = await createBusinessUser(
        driverTwoId,
        driverTwoEmail,
        'seed_driver_2',
        {
          nombre: 'Seed',
          apellido: 'Driver2',
          celular: '0999999902',
          ratingPromedio: 4.4,
          totalViajes: 4,
          totalCalificaciones: 4,
        },
      );

      const businessUserDriverThree = await createBusinessUser(
        driverThreeId,
        driverThreeEmail,
        'seed_driver_3',
        {
          nombre: 'Seed',
          apellido: 'Driver3',
          celular: '0999999903',
          ratingPromedio: 4.8,
          totalViajes: 3,
          totalCalificaciones: 3,
        },
      );

      const businessUserPassengerOne = await createBusinessUser(
        passengerOneId,
        passengerOneEmail,
        'seed_passenger_1',
        {
          nombre: 'Seed',
          apellido: 'Passenger1',
          celular: '0999999911',
          ratingPromedio: 4,
          totalViajes: 2,
          totalCalificaciones: 2,
        },
      );

      const businessUserPassengerTwo = await createBusinessUser(
        passengerTwoId,
        passengerTwoEmail,
        'seed_passenger_2',
        {
          nombre: 'Seed',
          apellido: 'Passenger2',
          celular: '0999999912',
          ratingPromedio: 4.5,
          totalViajes: 3,
          totalCalificaciones: 3,
        },
      );

      const businessUserPassengerThree = await createBusinessUser(
        passengerThreeId,
        passengerThreeEmail,
        'seed_passenger_3',
        {
          nombre: 'Seed',
          apellido: 'Passenger3',
          celular: '0999999913',
          ratingPromedio: 3.8,
          totalViajes: 1,
          totalCalificaciones: 1,
        },
      );

      const businessUserPassengerFour = await createBusinessUser(
        passengerFourId,
        passengerFourEmail,
        'seed_passenger_4',
        {
          nombre: 'Seed',
          apellido: 'Passenger4',
          celular: '0999999914',
          ratingPromedio: 4.2,
          totalViajes: 2,
          totalCalificaciones: 2,
        },
      );

      const businessUserPassengerFive = await createBusinessUser(
        passengerFiveId,
        passengerFiveEmail,
        'seed_passenger_5',
        {
          nombre: 'Seed',
          apellido: 'Passenger5',
          celular: '0999999915',
          ratingPromedio: 4.1,
          totalViajes: 1,
          totalCalificaciones: 1,
        },
      );

      const businessUserPassengerSix = await createBusinessUser(
        passengerSixId,
        passengerSixEmail,
        'seed_passenger_6',
        {
          nombre: 'Seed',
          apellido: 'Passenger6',
          celular: '0999999916',
          ratingPromedio: 4.7,
          totalViajes: 2,
          totalCalificaciones: 2,
        },
      );

      await createBusinessUser(adminId, adminEmail, 'seed_admin', {
        nombre: 'Seed',
        apellido: 'Admin',
        celular: '0999999900',
      });

      await createBusinessUser(userId, userEmail, 'seed_user', {
        nombre: 'Seed',
        apellido: 'User',
        celular: '0999999909',
      });

      const driverOne = await driverRepo.save(
        driverRepo.create({
          publicId: await generatePublicId(driverRepo, 'DRV'),
          businessUserId: businessUserDriverOne.id,
          paypalEmail: 'seed.driver1@paypal.com',
          estado: EstadoConductorEnum.APROBADO,
          fechaAprobacion: now,
        }),
      );
      const driverTwo = await driverRepo.save(
        driverRepo.create({
          publicId: await generatePublicId(driverRepo, 'DRV'),
          businessUserId: businessUserDriverTwo.id,
          paypalEmail: 'seed.driver2@paypal.com',
          estado: EstadoConductorEnum.APROBADO,
          fechaAprobacion: now,
        }),
      );
      const driverThree = await driverRepo.save(
        driverRepo.create({
          publicId: await generatePublicId(driverRepo, 'DRV'),
          businessUserId: businessUserDriverThree.id,
          paypalEmail: 'seed.driver3@paypal.com',
          estado: EstadoConductorEnum.APROBADO,
          fechaAprobacion: now,
        }),
      );

      await documentRepo.save([
        documentRepo.create({
          publicId: await generatePublicId(documentRepo, 'DOC'),
          driverId: driverOne.id,
          tipo: TipoDocumentoEnum.LICENCIA,
          archivoUrl: 'seed/driver1/licencia.pdf',
          estado: EstadoDocumentoEnum.APROBADO,
        }),
        documentRepo.create({
          publicId: await generatePublicId(documentRepo, 'DOC'),
          driverId: driverOne.id,
          tipo: TipoDocumentoEnum.MATRICULA,
          archivoUrl: 'seed/driver1/matricula.pdf',
          estado: EstadoDocumentoEnum.APROBADO,
        }),
        documentRepo.create({
          publicId: await generatePublicId(documentRepo, 'DOC'),
          driverId: driverTwo.id,
          tipo: TipoDocumentoEnum.LICENCIA,
          archivoUrl: 'seed/driver2/licencia.pdf',
          estado: EstadoDocumentoEnum.APROBADO,
        }),
        documentRepo.create({
          publicId: await generatePublicId(documentRepo, 'DOC'),
          driverId: driverTwo.id,
          tipo: TipoDocumentoEnum.MATRICULA,
          archivoUrl: 'seed/driver2/matricula.pdf',
          estado: EstadoDocumentoEnum.APROBADO,
        }),
        documentRepo.create({
          publicId: await generatePublicId(documentRepo, 'DOC'),
          driverId: driverThree.id,
          tipo: TipoDocumentoEnum.LICENCIA,
          archivoUrl: 'seed/driver3/licencia.pdf',
          estado: EstadoDocumentoEnum.APROBADO,
        }),
        documentRepo.create({
          publicId: await generatePublicId(documentRepo, 'DOC'),
          driverId: driverThree.id,
          tipo: TipoDocumentoEnum.MATRICULA,
          archivoUrl: 'seed/driver3/matricula.pdf',
          estado: EstadoDocumentoEnum.APROBADO,
        }),
      ]);

      await vehicleRepo.save([
        vehicleRepo.create({
          publicId: await generatePublicId(vehicleRepo, 'VEH'),
          driverId: driverOne.id,
          marca: 'Toyota',
          modelo: 'Corolla',
          color: 'Blanco',
          placa: 'SEA1234',
          asientosDisponibles: 4,
          isActivo: true,
        }),
        vehicleRepo.create({
          publicId: await generatePublicId(vehicleRepo, 'VEH'),
          driverId: driverTwo.id,
          marca: 'Chevrolet',
          modelo: 'Spark',
          color: 'Azul',
          placa: 'SEB1234',
          asientosDisponibles: 4,
          isActivo: true,
        }),
        vehicleRepo.create({
          publicId: await generatePublicId(vehicleRepo, 'VEH'),
          driverId: driverThree.id,
          marca: 'Kia',
          modelo: 'Rio',
          color: 'Gris',
          placa: 'SEC1234',
          asientosDisponibles: 3,
          isActivo: true,
        }),
      ]);

      const routeOne = await routeRepo.save(
        routeRepo.create({
          publicId: await generatePublicId(routeRepo, 'RTE'),
          driverId: driverOne.id,
          origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
          fecha: today,
          horaSalida: '08:30',
          destinoBase: 'Centro Histórico Quito',
          asientosTotales: 3,
          asientosDisponibles: 0,
          precioPasajero: 1.5,
          estado: EstadoRutaEnum.FINALIZADA,
          mensaje: 'Seed route 1',
          stops: await createStops(-0.2102, -78.4896, 'Campus EPN'),
        }),
      );

      const routeTwo = await routeRepo.save(
        routeRepo.create({
          publicId: await generatePublicId(routeRepo, 'RTE'),
          driverId: driverOne.id,
          origen: CampusOrigenEnum.EL_BOSQUE,
          fecha: tomorrow,
          horaSalida: '07:45',
          destinoBase: 'Parque La Carolina',
          asientosTotales: 3,
          asientosDisponibles: 2,
          precioPasajero: 1,
          estado: EstadoRutaEnum.ACTIVA,
          mensaje: 'Seed route 2',
          stops: await createStops(-0.1833, -78.485, 'La Carolina'),
        }),
      );

      const routeThree = await routeRepo.save(
        routeRepo.create({
          publicId: await generatePublicId(routeRepo, 'RTE'),
          driverId: driverTwo.id,
          origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
          fecha: yesterday,
          horaSalida: '09:15',
          destinoBase: 'Av. 10 de Agosto',
          asientosTotales: 4,
          asientosDisponibles: 2,
          precioPasajero: 2,
          estado: EstadoRutaEnum.FINALIZADA,
          mensaje: 'Seed route 3',
          stops: await createStops(-0.1934, -78.4875, '10 de Agosto'),
        }),
      );

      const routeFour = await routeRepo.save(
        routeRepo.create({
          publicId: await generatePublicId(routeRepo, 'RTE'),
          driverId: driverTwo.id,
          origen: CampusOrigenEnum.EL_BOSQUE,
          fecha: today,
          horaSalida: '18:00',
          destinoBase: 'Centro Comercial El Recreo',
          asientosTotales: 3,
          asientosDisponibles: 3,
          precioPasajero: 1.8,
          estado: EstadoRutaEnum.CANCELADA,
          mensaje: 'Seed route 4 cancelled',
          stops: await createStops(-0.2532, -78.5227, 'El Recreo'),
        }),
      );

      const routeFive = await routeRepo.save(
        routeRepo.create({
          publicId: await generatePublicId(routeRepo, 'RTE'),
          driverId: driverThree.id,
          origen: CampusOrigenEnum.CAMPUS_PRINCIPAL,
          fecha: tomorrow,
          horaSalida: '12:00',
          destinoBase: 'Quicentro Shopping',
          asientosTotales: 2,
          asientosDisponibles: 2,
          precioPasajero: 1.2,
          estado: EstadoRutaEnum.ACTIVA,
          mensaje: 'Seed route 5',
          stops: await createStops(-0.1802, -78.4825, 'Quicentro'),
        }),
      );

      const routeSix = await routeRepo.save(
        routeRepo.create({
          publicId: await generatePublicId(routeRepo, 'RTE'),
          driverId: driverThree.id,
          origen: CampusOrigenEnum.EL_BOSQUE,
          fecha: yesterday,
          horaSalida: '15:20',
          destinoBase: 'Av. 6 de Diciembre y Orellana',
          asientosTotales: 2,
          asientosDisponibles: 0,
          precioPasajero: 1.3,
          estado: EstadoRutaEnum.FINALIZADA,
          mensaje: 'Seed route 6',
          stops: await createStops(-0.1988, -78.4892, '6 de Diciembre'),
        }),
      );

      const bookingOne = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeOne.id,
          passengerId: businessUserPassengerOne.id,
          estado: EstadoReservaEnum.COMPLETADA,
          otp: '111111',
          otpUsado: true,
          metodoPago: MetodoPagoEnum.PAYPAL,
        }),
      );

      const bookingTwo = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeOne.id,
          passengerId: businessUserPassengerTwo.id,
          estado: EstadoReservaEnum.COMPLETADA,
          otp: '222222',
          otpUsado: true,
          metodoPago: MetodoPagoEnum.TARJETA,
        }),
      );

      const bookingThree = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeOne.id,
          passengerId: businessUserPassengerThree.id,
          estado: EstadoReservaEnum.NO_SHOW,
          otp: '333333',
          otpUsado: false,
          metodoPago: MetodoPagoEnum.EFECTIVO,
        }),
      );

      const bookingFour = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeTwo.id,
          passengerId: businessUserPassengerFour.id,
          estado: EstadoReservaEnum.CONFIRMADA,
          otp: '444444',
          otpUsado: false,
          metodoPago: MetodoPagoEnum.PAYPAL,
        }),
      );

      const bookingFive = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeThree.id,
          passengerId: businessUserPassengerFour.id,
          estado: EstadoReservaEnum.COMPLETADA,
          otp: '555555',
          otpUsado: true,
          metodoPago: MetodoPagoEnum.PAYPAL,
        }),
      );

      const bookingSix = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeThree.id,
          passengerId: businessUserPassengerFive.id,
          estado: EstadoReservaEnum.NO_SHOW,
          otp: '666666',
          otpUsado: false,
          metodoPago: MetodoPagoEnum.EFECTIVO,
        }),
      );

      const bookingSeven = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeFour.id,
          passengerId: businessUserPassengerSix.id,
          estado: EstadoReservaEnum.CANCELADA,
          otp: '777777',
          otpUsado: false,
          metodoPago: MetodoPagoEnum.TARJETA,
          cancelledAt: now,
        }),
      );

      const bookingEight = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeSix.id,
          passengerId: businessUserPassengerTwo.id,
          estado: EstadoReservaEnum.COMPLETADA,
          otp: '888888',
          otpUsado: true,
          metodoPago: MetodoPagoEnum.EFECTIVO,
        }),
      );

      const bookingNine = await bookingRepo.save(
        bookingRepo.create({
          publicId: await generatePublicId(bookingRepo, 'BKG'),
          routeId: routeSix.id,
          passengerId: businessUserPassengerSix.id,
          estado: EstadoReservaEnum.COMPLETADA,
          otp: '999999',
          otpUsado: true,
          metodoPago: MetodoPagoEnum.PAYPAL,
        }),
      );

      const paymentOne = await paymentRepo.save(
        paymentRepo.create({
          publicId: await generatePublicId(paymentRepo, 'PAY'),
          bookingId: bookingOne.id,
          amount: Number(routeOne.precioPasajero),
          currency: 'USD',
          method: MetodoPagoEnum.PAYPAL,
          status: EstadoPagoEnum.PAID,
          paypalOrderId: 'seed-order-1',
          paypalCaptureId: 'seed-cap-1',
          paidAt: now,
        }),
      );

      const paymentTwo = await paymentRepo.save(
        paymentRepo.create({
          publicId: await generatePublicId(paymentRepo, 'PAY'),
          bookingId: bookingTwo.id,
          amount: Number(routeOne.precioPasajero),
          currency: 'USD',
          method: MetodoPagoEnum.TARJETA,
          status: EstadoPagoEnum.PAID,
          paypalOrderId: 'seed-order-2',
          paypalCaptureId: 'seed-cap-2',
          paidAt: now,
        }),
      );

      const paymentThree = await paymentRepo.save(
        paymentRepo.create({
          publicId: await generatePublicId(paymentRepo, 'PAY'),
          bookingId: bookingFour.id,
          amount: Number(routeTwo.precioPasajero),
          currency: 'USD',
          method: MetodoPagoEnum.PAYPAL,
          status: EstadoPagoEnum.PENDING,
          paypalOrderId: 'seed-order-3',
        }),
      );

      const paymentFour = await paymentRepo.save(
        paymentRepo.create({
          publicId: await generatePublicId(paymentRepo, 'PAY'),
          bookingId: bookingFive.id,
          amount: Number(routeThree.precioPasajero),
          currency: 'USD',
          method: MetodoPagoEnum.PAYPAL,
          status: EstadoPagoEnum.PAID,
          paypalOrderId: 'seed-order-4',
          paypalCaptureId: 'seed-cap-4',
          paidAt: now,
        }),
      );

      const paymentFive = await paymentRepo.save(
        paymentRepo.create({
          publicId: await generatePublicId(paymentRepo, 'PAY'),
          bookingId: bookingSeven.id,
          amount: Number(routeFour.precioPasajero),
          currency: 'USD',
          method: MetodoPagoEnum.TARJETA,
          status: EstadoPagoEnum.REVERSED,
          paypalOrderId: 'seed-order-5',
          paypalCaptureId: 'seed-cap-5',
          reversedAt: now,
        }),
      );

      const paymentSix = await paymentRepo.save(
        paymentRepo.create({
          publicId: await generatePublicId(paymentRepo, 'PAY'),
          bookingId: bookingNine.id,
          amount: Number(routeSix.precioPasajero),
          currency: 'USD',
          method: MetodoPagoEnum.PAYPAL,
          status: EstadoPagoEnum.PAID,
          paypalOrderId: 'seed-order-6',
          paypalCaptureId: 'seed-cap-6',
          paidAt: now,
        }),
      );

      const payoutOneAmount = Number(
        (Number(paymentOne.amount) + Number(paymentTwo.amount)).toFixed(2),
      );
      const payoutTwoAmount = Number(paymentFour.amount);
      const payoutThreeAmount = Number(paymentSix.amount);

      const payoutOne = await payoutRepo.save(
        payoutRepo.create({
          publicId: await generatePublicId(payoutRepo, 'PYO'),
          driverId: driverOne.id,
          period,
          amount: payoutOneAmount,
          status: EstadoPayoutEnum.PAID,
          paypalBatchId: 'seed-batch-1',
          attempts: 1,
          paidAt: now,
        }),
      );
      const payoutTwo = await payoutRepo.save(
        payoutRepo.create({
          publicId: await generatePublicId(payoutRepo, 'PYO'),
          driverId: driverTwo.id,
          period,
          amount: payoutTwoAmount,
          status: EstadoPayoutEnum.PENDING,
        }),
      );
      const payoutThree = await payoutRepo.save(
        payoutRepo.create({
          publicId: await generatePublicId(payoutRepo, 'PYO'),
          driverId: driverThree.id,
          period,
          amount: payoutThreeAmount,
          status: EstadoPayoutEnum.FAILED,
          attempts: 1,
          lastError: 'seed failure',
        }),
      );

      paymentOne.payoutId = payoutOne.id;
      paymentTwo.payoutId = payoutOne.id;
      paymentFour.payoutId = payoutTwo.id;
      paymentSix.payoutId = payoutThree.id;
      await paymentRepo.save([paymentOne, paymentTwo, paymentFour, paymentSix]);

      await ratingRepo.save([
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserPassengerOne.id,
          toUserId: businessUserDriverOne.id,
          routeId: routeOne.id,
          score: 5,
          comment: 'Great ride',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserDriverOne.id,
          toUserId: businessUserPassengerOne.id,
          routeId: routeOne.id,
          score: 4,
          comment: 'Good passenger',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserPassengerTwo.id,
          toUserId: businessUserDriverOne.id,
          routeId: routeOne.id,
          score: 4,
          comment: 'Nice driver',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserDriverOne.id,
          toUserId: businessUserPassengerTwo.id,
          routeId: routeOne.id,
          score: 5,
          comment: 'On time',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserPassengerThree.id,
          toUserId: businessUserDriverOne.id,
          routeId: routeOne.id,
          score: 3,
          comment: 'No show',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserPassengerFour.id,
          toUserId: businessUserDriverTwo.id,
          routeId: routeThree.id,
          score: 5,
          comment: 'Smooth ride',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserDriverTwo.id,
          toUserId: businessUserPassengerFour.id,
          routeId: routeThree.id,
          score: 4,
          comment: 'Great rider',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserPassengerFive.id,
          toUserId: businessUserDriverTwo.id,
          routeId: routeThree.id,
          score: 4,
          comment: 'Good route',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserPassengerTwo.id,
          toUserId: businessUserDriverThree.id,
          routeId: routeSix.id,
          score: 5,
          comment: 'Excellent',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserDriverThree.id,
          toUserId: businessUserPassengerTwo.id,
          routeId: routeSix.id,
          score: 4,
          comment: 'Friendly rider',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserPassengerSix.id,
          toUserId: businessUserDriverThree.id,
          routeId: routeSix.id,
          score: 5,
          comment: 'Very good',
        }),
        ratingRepo.create({
          publicId: await generatePublicId(ratingRepo, 'RAT'),
          fromUserId: businessUserDriverThree.id,
          toUserId: businessUserPassengerSix.id,
          routeId: routeSix.id,
          score: 4,
          comment: 'Nice trip',
        }),
      ]);

      return {
        authUsersCount: authUsers.length,
        drivers: [driverOne.publicId, driverTwo.publicId, driverThree.publicId],
        routes: [
          routeOne.publicId,
          routeTwo.publicId,
          routeThree.publicId,
          routeFour.publicId,
          routeFive.publicId,
          routeSix.publicId,
        ],
        bookings: [
          bookingOne.publicId,
          bookingTwo.publicId,
          bookingThree.publicId,
          bookingFour.publicId,
          bookingFive.publicId,
          bookingSix.publicId,
          bookingSeven.publicId,
          bookingEight.publicId,
          bookingNine.publicId,
        ],
        payments: [
          paymentOne.publicId,
          paymentTwo.publicId,
          paymentThree.publicId,
          paymentFour.publicId,
          paymentFive.publicId,
          paymentSix.publicId,
        ],
        payouts: [payoutOne.publicId, payoutTwo.publicId, payoutThree.publicId],
        ratingsCount: 12,
      };
    });

    const loginInfo = {
      password: seedPassword,
      accounts: [
        {
          role: RolUsuarioEnum.ADMIN,
          email: adminEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.USER,
          email: userEmail,
          verified: false,
        },
        {
          role: RolUsuarioEnum.CONDUCTOR,
          email: driverOneEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.CONDUCTOR,
          email: driverTwoEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.CONDUCTOR,
          email: driverThreeEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.PASAJERO,
          email: passengerOneEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.PASAJERO,
          email: passengerTwoEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.PASAJERO,
          email: passengerThreeEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.PASAJERO,
          email: passengerFourEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.PASAJERO,
          email: passengerFiveEmail,
          verified: true,
        },
        {
          role: RolUsuarioEnum.PASAJERO,
          email: passengerSixEmail,
          verified: true,
        },
      ],
    };

    await this.auditService.logEvent({
      action: AuditAction.ADMIN_CONFIG_CHANGE,
      userId: adminUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { seed: true, ...result },
    });

    this.logger.log(`Seed data created by admin ${adminUserId}`);

    return {
      message: ErrorMessages.ADMIN.SEED_COMPLETED,
      data: { ...result, loginInfo },
    };
  }
}
