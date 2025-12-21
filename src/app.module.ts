import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VerificationModule } from './modules/verification/verification.module';
import { AuditModule } from './modules/audit/audit.module';
import { CommonModule } from './modules/common/common.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    VerificationModule,
    AuditModule,
    CommonModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
