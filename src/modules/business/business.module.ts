import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { BusinessUser } from './Models/business-user.entity';
import { UserProfile } from './Models/user-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BusinessUser, UserProfile])],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
