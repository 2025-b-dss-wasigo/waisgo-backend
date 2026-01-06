import { StorageService } from './../storage/storage.service';
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { BusinessUser } from './Models/business-user.entity';
import { UserProfile } from './Models/user-profile.entity';
import { Repository, EntityManager } from 'typeorm';
import { UpdateProfileDto } from './Dto';
import { ErrorMessages } from '../common/constants/error-messages.constant';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditResult } from '../audit/Enums';
import type { AuthContext } from '../common/types';
import { generatePublicId } from '../common/utils/public-id.util';
import { AuthUser } from '../auth/Models/auth-user.entity';
import { RedisService } from 'src/redis/redis.service';
import { parseDurationToSeconds } from '../common/utils/duration.util';
import { hasValidFileSignature } from '../common/utils/file-validation.util';
import { EstadoVerificacionEnum } from '../auth/Enum';

type AliasPrefix = 'Pasajero' | 'Conductor';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);
  private readonly DEFAULT_REVOKE_TTL_SECONDS = 8 * 60 * 60;
  private readonly SOFT_DELETE_BLOCK_YEARS = 100;
  private readonly MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024;
  private readonly ALLOWED_PROFILE_MIMES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];
  private readonly ALIAS_ATTEMPTS = 10;

  constructor(
    @InjectRepository(BusinessUser)
    private readonly businessUserRepo: Repository<BusinessUser>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(AuthUser)
    private readonly authUserRepo: Repository<AuthUser>,
    private readonly storageService: StorageService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {}

  private randomAliasSuffix(): string {
    const suffix = randomInt(1000, 10000);
    return suffix.toString();
  }

  private async generateAliasWithPrefix(
    repo: Repository<BusinessUser>,
    prefix: AliasPrefix,
  ): Promise<string> {
    for (let attempt = 0; attempt < this.ALIAS_ATTEMPTS; attempt++) {
      const alias = `${prefix}${this.randomAliasSuffix()}`;
      const existing = await repo.findOne({ where: { alias } });
      if (!existing) {
        return alias;
      }
    }
    throw new InternalServerErrorException(
      ErrorMessages.SYSTEM.ALIAS_GENERATION_FAILED,
    );
  }

  async updateAlias(userId: string, prefix: AliasPrefix): Promise<void> {
    const user = await this.businessUserRepo.findOne({
      where: { id: userId, isDeleted: false },
    });

    if (!user) {
      this.logger.warn(
        `Business user not found when updating alias: ${userId}`,
      );
      return;
    }

    if (user.alias?.startsWith(prefix)) {
      return;
    }

    user.alias = await this.generateAliasWithPrefix(
      this.businessUserRepo,
      prefix,
    );
    await this.businessUserRepo.save(user);
  }

  async createFromAuth(
    userId: string,
    data: {
      email: string;
      nombre: string;
      apellido: string;
      celular: string;
    },
  ): Promise<{ publicId: string; alias: string }> {
    const publicId = await generatePublicId(this.businessUserRepo, 'USR');
    const alias = await this.generateAliasWithPrefix(
      this.businessUserRepo,
      'Pasajero',
    );
    const businessUser = this.businessUserRepo.create({
      id: userId,
      publicId,
      email: data.email,
      alias,
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

    return { publicId, alias };
  }

  /**
   * Crea un usuario de negocio usando un EntityManager (para transacciones)
   */
  async createFromAuthWithManager(
    manager: EntityManager,
    userId: string,
    data: {
      email: string;
      nombre: string;
      apellido: string;
      celular: string;
    },
  ): Promise<{ publicId: string; alias: string }> {
    const businessRepo = manager.getRepository(BusinessUser);
    const publicId = await generatePublicId(businessRepo, 'USR');
    const alias = await this.generateAliasWithPrefix(businessRepo, 'Pasajero');
    const businessUser = manager.create(BusinessUser, {
      id: userId,
      publicId,
      email: data.email,
      alias,
    });

    const profile = manager.create(UserProfile, {
      userId,
      nombre: data.nombre,
      apellido: data.apellido,
      celular: data.celular,
    });

    businessUser.profile = profile;

    await manager.save(businessUser);

    this.logger.log(`Business user created with transaction: ${userId}`);

    return { publicId, alias };
  }

  /**
   * Valida y actualiza el email si fue modificado
   */
  private async updateEmailIfChanged(
    userId: string,
    newEmail: string,
  ): Promise<{ businessUser: BusinessUser; authUser: AuthUser }> {
    const normalizedEmail = newEmail.toLowerCase().trim();

    const businessUser = await this.businessUserRepo.findOne({
      where: { id: userId, isDeleted: false },
    });

    if (!businessUser) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    const authUser = await this.authUserRepo.findOne({
      where: { id: userId },
    });

    if (!authUser) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    if (authUser.estadoVerificacion === EstadoVerificacionEnum.VERIFICADO) {
      throw new BadRequestException(ErrorMessages.USER.EMAIL_CHANGE_LOCKED);
    }

    if (businessUser.email.toLowerCase() !== normalizedEmail) {
      const existingAuth = await this.authUserRepo.findOne({
        where: { email: normalizedEmail },
      });

      if (existingAuth && existingAuth.id !== userId) {
        throw new ConflictException(ErrorMessages.AUTH.EMAIL_ALREADY_EXISTS);
      }

      businessUser.email = normalizedEmail;
      authUser.email = normalizedEmail;
    }

    return { businessUser, authUser };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const profile = await this.profileRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    // Actualizar campos básicos del perfil
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

    await this.auditService.logEvent({
      action: AuditAction.PROFILE_UPDATE,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { changes: dto },
    });

    return { message: ErrorMessages.USER.PROFILE_UPDATED };
  }

  async softDeleteUser(userId: string, context?: AuthContext): Promise<void> {
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
      const blockedUntil = new Date();
      blockedUntil.setFullYear(
        blockedUntil.getFullYear() + this.SOFT_DELETE_BLOCK_YEARS,
      );

      await this.authUserRepo.update(
        { id: userId },
        { bloqueadoHasta: blockedUntil },
      );

      await this.redisService.revokeUserSessions(
        userId,
        this.getSessionRevokeTtlSeconds(),
      );

      this.logger.log(`User soft deleted: ${userId}`);

      await this.auditService.logEvent({
        action: AuditAction.ACCOUNT_DEACTIVATED,
        userId,
        result: AuditResult.SUCCESS,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
      });
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

  async findByPublicId(publicId: string): Promise<BusinessUser | null> {
    return this.businessUserRepo.findOne({
      where: { publicId, isDeleted: false },
      relations: ['profile'],
    });
  }

  async getMyProfile(userId: string) {
    const user = await this.businessUserRepo.findOne({
      where: { id: userId, isDeleted: false },
      relations: ['profile'],
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    if (!user.profile) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    const avatarUrl = user.profile.fotoPerfilUrl
      ? await this.storageService.getSignedUrl(
          this.config.getOrThrow('STORAGE_PROFILE_BUCKET'),
          user.profile.fotoPerfilUrl,
        )
      : await this.getDefaultAvatarUrl();

    return {
      id: user.id,
      publicId: user.publicId,
      alias: user.alias,
      email: user.email,
      nombre: user.profile.nombre,
      apellido: user.profile.apellido,
      celular: user.profile.celular,
      avatarUrl,
      rating: user.profile.ratingPromedio,
      totalViajes: user.profile.totalViajes,
    };
  }

  async updateProfilePhoto(
    userId: string,
    file: Express.Multer.File,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    if (!file) {
      throw new BadRequestException(ErrorMessages.DRIVER.FILE_REQUIRED);
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(ErrorMessages.DRIVER.FILE_VOID);
    }

    if (file.size > this.MAX_PROFILE_PHOTO_SIZE) {
      throw new BadRequestException(ErrorMessages.DRIVER.FILE_TOO_LARGE);
    }

    if (!this.ALLOWED_PROFILE_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(ErrorMessages.DRIVER.INVALID_FILE_FORMAT);
    }

    if (!hasValidFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(ErrorMessages.DRIVER.FILE_SIGNATURE);
    }

    const profile = await this.profileRepo.findOne({ where: { userId } });

    if (!profile) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    const objectPath = await this.storageService.upload({
      bucket: this.config.getOrThrow('STORAGE_PROFILE_BUCKET'),
      folder: 'avatars',
      filename: `user-${userId}.jpg`,
      buffer: file.buffer,
      mimetype: file.mimetype,
    });

    profile.fotoPerfilUrl = objectPath;
    await this.profileRepo.save(profile);

    await this.auditService.logEvent({
      action: AuditAction.PROFILE_PHOTO_UPDATE,
      userId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { objectPath },
    });

    return { message: ErrorMessages.USER.PROFILE_PHOTO_UPDATED };
  }

  private getDefaultAvatarUrl(): Promise<string> {
    return this.storageService.getSignedUrl(
      this.config.getOrThrow('STORAGE_PROFILE_BUCKET'),
      'avatars/default.jpg',
    );
  }

  private getSessionRevokeTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get<string>('JWT_EXPIRES_IN'),
      this.DEFAULT_REVOKE_TTL_SECONDS,
    );
  }
}
