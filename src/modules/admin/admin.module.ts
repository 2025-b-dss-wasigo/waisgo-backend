import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminDriversController } from './admin.controller';
import { AdminService } from './admin.service';
import { Driver } from '../drivers/Models/driver.entity';
import { DriverDocument } from '../drivers/Models/driver-document.entity';
import { AuthUser } from '../auth/Models/auth-user.entity';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverDocument, AuthUser]),
    AuditModule,
    MailModule,
  ],
  controllers: [AdminDriversController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
