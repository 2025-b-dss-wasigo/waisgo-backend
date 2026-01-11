/**
 * Modulo de metricas.
 */

import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsSnapshotService } from './metrics.snapshot.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsSnapshotService],
  exports: [MetricsService],
})
export class MetricsModule {}
