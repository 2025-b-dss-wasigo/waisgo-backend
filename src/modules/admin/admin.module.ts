import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AdminDriversController } from './admin.controller';
import { AdminService } from './admin.service';
import { Driver } from '../drivers/Models/driver.entity';
import { DriverDocument } from '../drivers/Models/driver-document.entity';
import { AuthUser } from '../auth/Models/auth-user.entity';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverDocument, AuthUser]),
    ConfigModule,
    AuditModule,
    MailModule,
    StorageModule,
  ],
  controllers: [AdminDriversController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
