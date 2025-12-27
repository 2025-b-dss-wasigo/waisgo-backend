import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  HealthCheckResult,
} from '@nestjs/terminus';
import { Public } from '../Decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check del sistema' })
  @ApiResponse({ status: 200, description: 'Sistema operativo' })
  @ApiResponse({ status: 503, description: 'Servicio no disponible' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
