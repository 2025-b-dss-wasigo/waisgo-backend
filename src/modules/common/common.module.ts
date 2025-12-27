import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule],
  exports: [HealthModule],
})
export class CommonModule {}
