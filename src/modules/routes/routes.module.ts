/**
 * Modulo NestJS de routes.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { Route } from './Models/route.entity';
import { RouteStop } from './Models/route-stop.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { Vehicle } from '../drivers/Models/vehicle.entity';
import { UserProfile } from '../business/Models/user-profile.entity';
import { Booking } from '../bookings/Models/booking.entity';
import { Payment } from '../payments/Models/payment.entity';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Route,
      RouteStop,
      Driver,
      Vehicle,
      UserProfile,
      Booking,
      Payment,
    ]),
    AuditModule,
    PaymentsModule,
  ],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [TypeOrmModule],
})
export class RoutesModule {}
