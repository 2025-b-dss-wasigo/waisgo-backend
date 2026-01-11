/**
 * Interceptor para metricas HTTP.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();
    const routePath =
      request?.route?.path || request?.originalUrl || request?.url || 'unknown';
    const method = request?.method || 'UNKNOWN';

    this.metricsService.httpRequestsInFlight.labels(method, routePath).inc();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      finalize(() => {
        const durationMs =
          Number(process.hrtime.bigint() - start) / 1_000_000;
        const status = response?.statusCode?.toString() || '0';

        this.metricsService.httpRequestsInFlight.labels(method, routePath).dec();
        this.metricsService.httpRequestsTotal
          .labels(method, routePath, status)
          .inc();
        this.metricsService.httpRequestDurationSeconds
          .labels(method, routePath, status)
          .observe(durationMs / 1000);
      }),
    );
  }
}
