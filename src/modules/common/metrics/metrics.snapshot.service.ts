/**
 * Servicio para actualizar metricas de estado con consultas a la BD.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MetricsService } from './metrics.service';
import { Route } from '../../routes/Models/route.entity';
import { Booking } from '../../bookings/Models/booking.entity';
import { Payment } from '../../payments/Models/payment.entity';
import { Payout } from '../../payments/Models/payout.entity';
import { Driver } from '../../drivers/Models/driver.entity';
import { EstadoRutaEnum } from '../../routes/Enums';
import { EstadoReservaEnum } from '../../bookings/Enums';
import { EstadoPagoEnum, EstadoPayoutEnum } from '../../payments/Enums';
import { EstadoConductorEnum } from '../../drivers/Enums/estado-conductor.enum';

type StatusCount = { estado: string; total: string };

@Injectable()
export class MetricsSnapshotService {
  private readonly logger = new Logger(MetricsSnapshotService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly metricsService: MetricsService,
  ) {}

  @Cron('*/2 * * * *')
  async refreshStateMetrics(): Promise<void> {
    try {
      await this.refreshRoutes();
      await this.refreshBookings();
      await this.refreshPayments();
      await this.refreshPayouts();
      await this.refreshDrivers();
    } catch (error) {
      this.logger.error(
        `Failed to refresh state metrics: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async refreshRoutes(): Promise<void> {
    const counts = await this.dataSource
      .getRepository(Route)
      .createQueryBuilder('route')
      .select('route.estado', 'estado')
      .addSelect('COUNT(*)', 'total')
      .groupBy('route.estado')
      .getRawMany<StatusCount>();

    const lookup = this.toLookup(counts);
    this.metricsService.routesStateTotal
      .labels(EstadoRutaEnum.ACTIVA)
      .set(lookup[EstadoRutaEnum.ACTIVA] ?? 0);
    this.metricsService.routesStateTotal
      .labels(EstadoRutaEnum.CANCELADA)
      .set(lookup[EstadoRutaEnum.CANCELADA] ?? 0);
    this.metricsService.routesStateTotal
      .labels(EstadoRutaEnum.FINALIZADA)
      .set(lookup[EstadoRutaEnum.FINALIZADA] ?? 0);
  }

  private async refreshBookings(): Promise<void> {
    const counts = await this.dataSource
      .getRepository(Booking)
      .createQueryBuilder('booking')
      .select('booking.estado', 'estado')
      .addSelect('COUNT(*)', 'total')
      .groupBy('booking.estado')
      .getRawMany<StatusCount>();

    const lookup = this.toLookup(counts);
    this.metricsService.bookingsStateTotal
      .labels(EstadoReservaEnum.CONFIRMADA)
      .set(lookup[EstadoReservaEnum.CONFIRMADA] ?? 0);
    this.metricsService.bookingsStateTotal
      .labels(EstadoReservaEnum.CANCELADA)
      .set(lookup[EstadoReservaEnum.CANCELADA] ?? 0);
    this.metricsService.bookingsStateTotal
      .labels(EstadoReservaEnum.NO_SHOW)
      .set(lookup[EstadoReservaEnum.NO_SHOW] ?? 0);
    this.metricsService.bookingsStateTotal
      .labels(EstadoReservaEnum.COMPLETADA)
      .set(lookup[EstadoReservaEnum.COMPLETADA] ?? 0);
  }

  private async refreshPayments(): Promise<void> {
    const counts = await this.dataSource
      .getRepository(Payment)
      .createQueryBuilder('payment')
      .select('payment.status', 'estado')
      .addSelect('COUNT(*)', 'total')
      .groupBy('payment.status')
      .getRawMany<StatusCount>();

    const lookup = this.toLookup(counts);
    this.metricsService.paymentsStateTotal
      .labels(EstadoPagoEnum.PENDING)
      .set(lookup[EstadoPagoEnum.PENDING] ?? 0);
    this.metricsService.paymentsStateTotal
      .labels(EstadoPagoEnum.PAID)
      .set(lookup[EstadoPagoEnum.PAID] ?? 0);
    this.metricsService.paymentsStateTotal
      .labels(EstadoPagoEnum.FAILED)
      .set(lookup[EstadoPagoEnum.FAILED] ?? 0);
    this.metricsService.paymentsStateTotal
      .labels(EstadoPagoEnum.REVERSED)
      .set(lookup[EstadoPagoEnum.REVERSED] ?? 0);
  }

  private async refreshPayouts(): Promise<void> {
    const counts = await this.dataSource
      .getRepository(Payout)
      .createQueryBuilder('payout')
      .select('payout.status', 'estado')
      .addSelect('COUNT(*)', 'total')
      .groupBy('payout.status')
      .getRawMany<StatusCount>();

    const lookup = this.toLookup(counts);
    this.metricsService.payoutsStateTotal
      .labels(EstadoPayoutEnum.PENDING)
      .set(lookup[EstadoPayoutEnum.PENDING] ?? 0);
    this.metricsService.payoutsStateTotal
      .labels(EstadoPayoutEnum.PAID)
      .set(lookup[EstadoPayoutEnum.PAID] ?? 0);
    this.metricsService.payoutsStateTotal
      .labels(EstadoPayoutEnum.FAILED)
      .set(lookup[EstadoPayoutEnum.FAILED] ?? 0);
  }

  private async refreshDrivers(): Promise<void> {
    const counts = await this.dataSource
      .getRepository(Driver)
      .createQueryBuilder('driver')
      .select('driver.estado', 'estado')
      .addSelect('COUNT(*)', 'total')
      .groupBy('driver.estado')
      .getRawMany<StatusCount>();

    const lookup = this.toLookup(counts);
    this.metricsService.driversStateTotal
      .labels(EstadoConductorEnum.PENDIENTE)
      .set(lookup[EstadoConductorEnum.PENDIENTE] ?? 0);
    this.metricsService.driversStateTotal
      .labels(EstadoConductorEnum.APROBADO)
      .set(lookup[EstadoConductorEnum.APROBADO] ?? 0);
    this.metricsService.driversStateTotal
      .labels(EstadoConductorEnum.RECHAZADO)
      .set(lookup[EstadoConductorEnum.RECHAZADO] ?? 0);
    this.metricsService.driversStateTotal
      .labels(EstadoConductorEnum.SUSPENDIDO)
      .set(lookup[EstadoConductorEnum.SUSPENDIDO] ?? 0);
  }

  private toLookup(entries: StatusCount[]): Record<string, number> {
    return entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.estado] = Number(entry.total ?? 0);
      return acc;
    }, {});
  }
}
