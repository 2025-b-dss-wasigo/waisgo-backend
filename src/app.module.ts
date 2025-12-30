import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CommonModule } from './modules/common/common.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { MailModule } from './modules/mail/mail.module';
import { OtpModule } from './modules/otp/otp.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RoutesModule } from './modules/routes/routes.module';
import { VerificationModule } from './modules/verification/verification.module';
import { RedisModule } from './redis/redis.module';
import { envSchema } from './config/env.schema';
import { BusinessModule } from './modules/business/business.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { StorageModule } from './modules/storage/storage.module';
import { VehicleModule } from './modules/vehicle/vehicle.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('THROTTLE_TTL', 60000),
          limit: configService.get<number>('THROTTLE_LIMIT', 100),
        },
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isSslEnabled =
          configService.get('DB_SSL') === 'true' ||
          configService.get('DB_SSL') === true;

        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
          autoLoadEntities: true,
          synchronize: false,
          ssl: isSslEnabled ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    RedisModule,
    MailModule,
    AuditModule,
    CommonModule,
    AuthModule,
    VerificationModule,
    OtpModule,
    DriversModule,
    RoutesModule,
    BookingsModule,
    PaymentsModule,
    BusinessModule,
    RatingsModule,
    StorageModule,
    VehicleModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
