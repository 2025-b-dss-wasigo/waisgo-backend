/**
 * Servicio de metricas Prometheus.
 */

import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  register,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly httpRequestDurationSeconds: Histogram<string>;
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestsInFlight: Gauge<string>;
  readonly routesEventsTotal: Counter<string>;
  readonly bookingsEventsTotal: Counter<string>;
  readonly paymentsEventsTotal: Counter<string>;
  readonly payoutsEventsTotal: Counter<string>;
  readonly ratingsEventsTotal: Counter<string>;
  readonly routesStateTotal: Gauge<string>;
  readonly bookingsStateTotal: Gauge<string>;
  readonly paymentsStateTotal: Gauge<string>;
  readonly payoutsStateTotal: Gauge<string>;
  readonly driversStateTotal: Gauge<string>;

  constructor() {
    collectDefaultMetrics({ register });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duracion de requests HTTP en segundos',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total de requests HTTP',
      labelNames: ['method', 'route', 'status'],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'Requests HTTP en curso',
      labelNames: ['method', 'route'],
    });

    this.routesEventsTotal = new Counter({
      name: 'routes_events_total',
      help: 'Eventos de rutas por tipo',
      labelNames: ['event'],
    });

    this.bookingsEventsTotal = new Counter({
      name: 'bookings_events_total',
      help: 'Eventos de reservas por tipo',
      labelNames: ['event'],
    });

    this.paymentsEventsTotal = new Counter({
      name: 'payments_events_total',
      help: 'Eventos de pagos por tipo',
      labelNames: ['event'],
    });

    this.payoutsEventsTotal = new Counter({
      name: 'payouts_events_total',
      help: 'Eventos de payouts por tipo',
      labelNames: ['event'],
    });

    this.ratingsEventsTotal = new Counter({
      name: 'ratings_events_total',
      help: 'Eventos de calificaciones por tipo',
      labelNames: ['event'],
    });

    this.routesStateTotal = new Gauge({
      name: 'routes_state_total',
      help: 'Total de rutas por estado',
      labelNames: ['estado'],
    });

    this.bookingsStateTotal = new Gauge({
      name: 'bookings_state_total',
      help: 'Total de reservas por estado',
      labelNames: ['estado'],
    });

    this.paymentsStateTotal = new Gauge({
      name: 'payments_state_total',
      help: 'Total de pagos por estado',
      labelNames: ['estado'],
    });

    this.payoutsStateTotal = new Gauge({
      name: 'payouts_state_total',
      help: 'Total de payouts por estado',
      labelNames: ['estado'],
    });

    this.driversStateTotal = new Gauge({
      name: 'drivers_state_total',
      help: 'Total de conductores por estado',
      labelNames: ['estado'],
    });
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }
}
