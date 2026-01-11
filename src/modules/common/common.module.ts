/**
 * Modulo NestJS de common.
 */

import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { StructuredLogger } from './logger';
import { GoogleMapsService } from './google-maps/google-maps.service';

@Module({
  imports: [HealthModule],
  providers: [StructuredLogger, GoogleMapsService],
  exports: [HealthModule, StructuredLogger, GoogleMapsService],
})
export class CommonModule {}
