import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
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

      const user = this.usersRepo.create({
        ...userDetails,
        alias: `Pasajero${randomBytes(4).toString('hex').toUpperCase()}`,
        rol: RolUsuarioEnum.USER,
        estadoVerificacion: EstadoVerificacionEnum.NO_VERIFICADO,
        credential: {
          passwordHash: await bcrypt.hash(password, 12),
        },
      });

      await this.usersRepo.save(user);

      return {
        success: true,
        message: 'Usuario registrado exitosamente',
        userId: user.id,
      };
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  async updateProfile(
    userId: string,
    dto: Partial<User>,
  ): Promise<{ message: string }> {
    await this.findAndValidate(userId, EstadoVerificacionEnum.VERIFICADO);

    const { nombre, apellido, celular } = dto;

    await this.update(userId, {
      ...(nombre && { nombre }),
      ...(apellido && { apellido }),
      ...(celular && { celular }),
    });

    return { message: 'Perfil actualizado correctamente' };
  }

  async changePassword(userId: string, currentPass: string, newPass: string) {
    const user = await this.findOneOrFail({
      where: { id: userId },
      relations: ['credential'],
    });

    this.validateUserStatus(user, EstadoVerificacionEnum.VERIFICADO);

    if (!(await bcrypt.compare(currentPass, user.credential.passwordHash))) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    if (await bcrypt.compare(newPass, user.credential.passwordHash)) {
      throw new BadRequestException(
        'La nueva contraseña no puede ser igual a la anterior',
      );
    }
    user.credential.passwordHash = await bcrypt.hash(newPass, 12);
    await this.usersRepo.save(user);

    return { message: 'Contraseña actualizada correctamente' };
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    if (Object.keys(data).length === 0) return;

    const result = await this.usersRepo.update(id, data);

    if (result.affected === 0) {
      throw new NotFoundException('Usuario no encontrado para actualizar');
    }
  }

  async findById(id: string): Promise<User> {
    return this.findOneOrFail({ where: { id } });
  }

  async findByIdForVerification(id: string) {
    return this.findOneOrFail({
      where: { id },
      select: ['id', 'email', 'alias', 'estadoVerificacion'],
    });
  }

  private async findOneOrFail(options: FindOneOptions<User>): Promise<User> {
    const user = await this.usersRepo.findOne({
      ...options,
      where: {
        ...(options.where as object),
        isDeleted: false,
      },
    });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    return user;
  }

  private validateUserStatus(
    user: User,
    expectedStatus: EstadoVerificacionEnum,
  ): void {
    if (user.estadoVerificacion !== expectedStatus) {
      throw new BadRequestException(
        `El usuario no tiene el estado requerido: ${expectedStatus}`,
      );
    }
  }

  private async findAndValidate(
    id: string,
    status: EstadoVerificacionEnum,
  ): Promise<User> {
    const user = await this.findOneOrFail({ where: { id } });
    this.validateUserStatus(user, status);
    return user;
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    this.logger.error(error);
    throw new InternalServerErrorException(
      'Error inesperado, revise los logs del servidor',
    );
  }
}
