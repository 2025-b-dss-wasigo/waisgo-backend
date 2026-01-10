/**
 * Modulo NestJS de business.
 */

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { BusinessUser } from './Models/business-user.entity';
import { UserProfile } from './Models/user-profile.entity';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthUser } from '../auth/Models/auth-user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BusinessUser, UserProfile, AuthUser]),
    StorageModule,
    AuditModule,
    IdentityModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
