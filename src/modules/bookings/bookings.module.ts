/**
 * Modulo NestJS de bookings.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { Booking } from './Models/booking.entity';
import { Route } from '../routes/Models/route.entity';
import { RouteStop } from '../routes/Models/route-stop.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { UserProfile } from '../business/Models/user-profile.entity';
import { Payment } from '../payments/Models/payment.entity';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      Route,
      RouteStop,
      Driver,
      UserProfile,
      Payment,
    ]),
    AuditModule,
    PaymentsModule,
    CommonModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [TypeOrmModule],
})
export class BookingsModule {}
