import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { JweAuthGuard } from './Guards/jwe-auth.guard';
import { RolesGuard } from './Guards/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { AuthUser } from './Models/auth-user.entity';
import { Credential } from './Models/credential.entity';
import { BusinessUser } from '../business/Models/business-user.entity';
import { CleanupUnverifiedUsersJob } from './Jobs/cleanup-unverifield-users.jobs';
import { BusinessModule } from '../business/business.module';
import { CommonModule } from '../common/common.module';

@Module({
  exports: [AuthService],
  providers: [
    CleanupUnverifiedUsersJob,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: JweAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  controllers: [AuthController],
  imports: [
    TypeOrmModule.forFeature([AuthUser, Credential, BusinessUser]),
    AuditModule,
    MailModule,
    BusinessModule,
    CommonModule,
  ],
})
export class AuthModule {}
