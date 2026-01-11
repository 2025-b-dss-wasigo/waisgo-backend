/**
 * Modulo NestJS de ratings.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { Rating } from './Models/rating.entity';
import { Route } from '../routes/Models/route.entity';
import { Booking } from '../bookings/Models/booking.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { BusinessUser } from '../business/Models/business-user.entity';
import { UserProfile } from '../business/Models/user-profile.entity';
import { AuditModule } from '../audit/audit.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Rating,
      Route,
      Booking,
      Driver,
      BusinessUser,
      UserProfile,
    ]),
    AuditModule,
    CommonModule,
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [TypeOrmModule],
})
export class RatingsModule {}
