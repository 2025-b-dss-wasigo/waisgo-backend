import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { Driver } from './Models/driver.entity';
import { DriverDocument } from './Models/driver-document.entity';
import { Vehicle } from './Models/vehicle.entity';
import { BusinessUser } from '../business/Models/business-user.entity';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverDocument, Vehicle, BusinessUser]),
    StorageModule,
    AuditModule,
    MailModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService, TypeOrmModule],
})
export class DriversModule {}
