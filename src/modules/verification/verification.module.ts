import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { OtpModule } from '../otp/otp.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessModule } from '../business/business.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  controllers: [VerificationController],
  providers: [VerificationService],
  imports: [AuthModule, OtpModule, MailModule, BusinessModule, AuditModule],
})
export class VerificationModule {}
