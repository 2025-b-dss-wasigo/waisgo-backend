/**
 * Modulo NestJS de payments.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { Payment } from './Models/payment.entity';
import { Payout } from './Models/payout.entity';
import { PaymentsController } from './payments.controller';
import { PayoutsController } from './payouts/payouts.controller';
import { PayoutsService } from './payouts/payouts.service';
import { PaypalClientService } from './paypal-client.service';
import { Booking } from '../bookings/Models/booking.entity';
import { Driver } from '../drivers/Models/driver.entity';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../common/idempotency/idempotency.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Payout, Booking, Driver]),
    AuditModule,
    IdempotencyModule,
    CommonModule,
  ],
  providers: [PaymentsService, PayoutsService, PaypalClientService],
  exports: [TypeOrmModule, PaymentsService],
  controllers: [PaymentsController, PayoutsController],
})
export class PaymentsModule {}
