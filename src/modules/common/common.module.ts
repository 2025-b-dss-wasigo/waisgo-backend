/**
 * Modulo NestJS de common.
 */

import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { StructuredLogger } from './logger';

@Module({
  imports: [HealthModule],
  providers: [StructuredLogger],
  exports: [HealthModule, StructuredLogger],
})
export class CommonModule {}
