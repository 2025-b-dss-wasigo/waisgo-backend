/**
 * Modulo NestJS de common.
 */

import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { StructuredLogger } from './logger';
import { GoogleMapsService } from './google-maps/google-maps.service';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [HealthModule, MetricsModule],
  providers: [StructuredLogger, GoogleMapsService],
  exports: [HealthModule, StructuredLogger, GoogleMapsService, MetricsModule],
})
export class CommonModule {}
