import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './Models/users.entity';
import { RegisterUserDto } from './Dto/register-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async register(dto: RegisterUserDto) {
    try {
      const { password, ...userDetails } = dto;
      const alias = `Pasajero${Math.floor(1000 + Math.random() * 9000)}`;
      const user = this.usersRepo.create({
        ...userDetails,
        alias,
        rol: 'USER',
        estadoVerificacion: 'NO_VERIFICADO',
        credential: {
          passwordHash: await bcrypt.hash(password, 12),
        },
      });
      await this.usersRepo.save(user);

      return {
        message: 'Usuario registrado exitosamente',
        userId: user.id,
        success: true,
      };
    } catch (error) {
      this.handleDBExeptions(error);
    }
  }

  private handleDBExeptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(`${error.name}: ${error.message}`);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
