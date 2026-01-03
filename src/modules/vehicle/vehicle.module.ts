import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehiclesController } from './vehicle.controller';
import { VehicleService } from './vehicle.service';
import { Vehicle } from '../drivers/Models/vehicle.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { AuditModule } from '../audit/audit.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vehicle, Driver]),
    AuditModule,
    BusinessModule,
  ],
  controllers: [VehiclesController],
  providers: [VehicleService],
  exports: [VehicleService],
})
export class VehicleModule {}
