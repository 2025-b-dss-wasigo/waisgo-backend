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
import { RolUsuarioEnum } from './Enums/users-roles.enum';
import { EstadoVerificacionEnum } from './Enums/estado-ver.enum';

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
        rol: RolUsuarioEnum.USER,
        estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
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

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }
    return user;
  }

  async findByIdForVerification(
    id: string,
  ): Promise<Pick<User, 'id' | 'email' | 'alias' | 'estadoVerificacion'>> {
    const user = await this.usersRepo.findOne({
      where: { id },
      select: ['id', 'email', 'alias', 'estadoVerificacion'],
    });
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }
    return user;
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    const result = await this.usersRepo.update(id, data);
    if (result.affected === 0) {
      throw new BadRequestException('Usuario no encontrado');
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
