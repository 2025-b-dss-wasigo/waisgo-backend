import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/Models/users.entity';
import { APP_GUARD } from '@nestjs/core';
import { JweAuthGuard } from './Guards/jwe-auth.guard';
import { RolesGuard } from './Guards/roles.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  providers: [
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
  imports: [TypeOrmModule.forFeature([User]), AuditModule],
})
export class AuthModule {}
