/**
 * Modulo NestJS de admin.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AdminDriversController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSeedController } from './admin-seed.controller';
import { AdminSeedService } from './admin-seed.service';
import { Driver } from '../drivers/Models/driver.entity';
import { DriverDocument } from '../drivers/Models/driver-document.entity';
import { Vehicle } from '../drivers/Models/vehicle.entity';
import { AuthUser } from '../auth/Models/auth-user.entity';
import { BusinessUser } from '../business/Models/business-user.entity';
import { UserProfile } from '../business/Models/user-profile.entity';
import { Route } from '../routes/Models/route.entity';
import { RouteStop } from '../routes/Models/route-stop.entity';
import { Booking } from '../bookings/Models/booking.entity';
import { Payment } from '../payments/Models/payment.entity';
import { Payout } from '../payments/Models/payout.entity';
import { Rating } from '../ratings/Models/rating.entity';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { StorageModule } from '../storage/storage.module';
import { BusinessModule } from '../business/business.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Driver,
      DriverDocument,
      Vehicle,
      AuthUser,
      BusinessUser,
      UserProfile,
      Route,
      RouteStop,
      Booking,
      Payment,
      Payout,
      Rating,
    ]),
    ConfigModule,
    AuditModule,
    MailModule,
    StorageModule,
    BusinessModule,
    CommonModule,
  ],
  controllers: [AdminDriversController, AdminSeedController],
  providers: [AdminService, AdminSeedService],
  exports: [AdminService],
})
export class AdminModule {}
