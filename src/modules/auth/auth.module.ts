import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/Models/users.entity';

@Module({
  providers: [AuthService],
  controllers: [AuthController],
  imports: [TypeOrmModule.forFeature([User])],
})
export class AuthModule {}
