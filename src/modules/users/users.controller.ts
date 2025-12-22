import { RegisterUserDto } from './Dto/register-user.dto';
import { Body, Controller, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from '../common/Decorators/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterUserDto) {
    return this.usersService.register(dto);
  }
}
