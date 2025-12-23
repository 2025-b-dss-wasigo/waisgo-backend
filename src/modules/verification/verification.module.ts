import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { UsersModule } from '../users/users.module';
import { OtpModule } from '../otp/otp.module';
import { MailModule } from '../mail/mail.module';

@Module({
  controllers: [VerificationController],
  providers: [VerificationService],
  imports: [UsersModule, OtpModule, MailModule],
})
export class VerificationModule {}
