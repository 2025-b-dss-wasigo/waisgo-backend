import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BusinessUser } from './Models/business-user.entity';
import { UserProfile } from './Models/user-profile.entity';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from './Dto/update-profile.dto';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);

  constructor(
    @InjectRepository(BusinessUser)
    private readonly businessUserRepo: Repository<BusinessUser>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
  ) {}

  private generateAlias(): string {
    const randomPart = Math.random().toString(16).slice(2, 8).toUpperCase();
    return `Pasajero${randomPart}`;
  }

  async createFromAuth(
    userId: string,
    data: {
      email: string;
      nombre: string;
      apellido: string;
      celular: string;
    },
  ): Promise<void> {
    const businessUser = this.businessUserRepo.create({
      id: userId,
      email: data.email,
      alias: this.generateAlias(),
    });

    const profile = this.profileRepo.create({
      userId,
      nombre: data.nombre,
      apellido: data.apellido,
      celular: data.celular,
    });

    businessUser.profile = profile;

    await this.businessUserRepo.save(businessUser);

    this.logger.log(`Business user created: ${userId}`);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<{ message: string }> {
    const profile = await this.profileRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Perfil no encontrado');
    }

    // Solo actualizar campos que están presentes en el DTO
    if (dto.nombre !== undefined) {
      profile.nombre = dto.nombre;
    }
    if (dto.apellido !== undefined) {
      profile.apellido = dto.apellido;
    }
    if (dto.celular !== undefined) {
      profile.celular = dto.celular;
    }

    await this.profileRepo.save(profile);

    this.logger.log(`Profile updated for user: ${userId}`);

    return { message: 'Perfil actualizado correctamente' };
  }

  async softDeleteUser(userId: string): Promise<void> {
    const result = await this.businessUserRepo.update(
      { id: userId, isDeleted: false },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    );

    if (result.affected === 0) {
      this.logger.warn(`User not found or already deleted: ${userId}`);
    } else {
      this.logger.log(`User soft deleted: ${userId}`);
    }
  }

  async getDisplayName(userId: string): Promise<string> {
    const user = await this.businessUserRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    if (!user) {
      return 'Usuario';
    }

    if (user.profile?.nombre) {
      const fullName =
        `${user.profile.nombre} ${user.profile.apellido ?? ''}`.trim();
      return fullName || 'Usuario';
    }

    if (user.alias) {
      return user.alias;
    }

    return 'Usuario';
  }

  async findByUserId(userId: string): Promise<BusinessUser | null> {
    return this.businessUserRepo.findOne({
      where: { id: userId, isDeleted: false },
      relations: ['profile'],
    });
  }
}
