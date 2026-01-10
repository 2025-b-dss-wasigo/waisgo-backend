/**
 * Servicio de negocio del modulo business.
 */

import { StorageService } from './../storage/storage.service';
import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
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
import { RedisService } from 'src/redis/redis.service';
import { parseDurationToSeconds } from '../common/utils/duration.util';
import { hasValidFileSignature } from '../common/utils/file-validation.util';
import { IdentityResolverService } from '../identity';
import { AuthUser } from '../auth/Models/auth-user.entity';

type AliasPrefix = 'Pasajero' | 'Conductor';

@Injectable()
export class BusinessService {
  private readonly logger = new Logger(BusinessService.name);
  private readonly DEFAULT_REVOKE_TTL_SECONDS = 8 * 60 * 60;
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
    private readonly storageService: StorageService,
    private readonly config: ConfigService,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
    private readonly identityResolver: IdentityResolverService,
    @InjectRepository(AuthUser)
    private readonly authUserRepo: Repository<AuthUser>,
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

  async updateAlias(
    businessUserId: string,
    prefix: AliasPrefix,
  ): Promise<void> {
    const user = await this.businessUserRepo.findOne({
      where: { id: businessUserId, isDeleted: false },
    });

    if (!user) {
      this.logger.warn(
        `Business user not found when updating alias: ${businessUserId}`,
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

  /**
   * Crea un usuario de negocio.
   * IMPORTANTE: Ya no recibe userId de auth - genera su propio UUID.
   * La correlación con auth se hace a través del IdentityResolverService.
   */
  async createFromAuth(data: {
    nombre: string;
    apellido: string;
    celular: string;
  }): Promise<{ businessUserId: string; publicId: string; alias: string }> {
    const publicId = await generatePublicId(this.businessUserRepo, 'USR');
    const alias = await this.generateAliasWithPrefix(
      this.businessUserRepo,
      'Pasajero',
    );

    // El ID se genera automáticamente (PrimaryGeneratedColumn)
    const businessUser = this.businessUserRepo.create({
      publicId,
      alias,
    });

    const savedUser = await this.businessUserRepo.save(businessUser);

    const profile = this.profileRepo.create({
      businessUserId: savedUser.id,
      nombre: data.nombre,
      apellido: data.apellido,
      celular: data.celular,
    });

    await this.profileRepo.save(profile);

    this.logger.log(`Business user created: ${savedUser.id}`);

    return {
      businessUserId: savedUser.id,
      publicId,
      alias,
    };
  }

  /**
   * Crea un usuario de negocio usando un EntityManager (para transacciones).
   * IMPORTANTE: Ya no recibe userId de auth - genera su propio UUID.
   * La correlación con auth se hace a través del IdentityResolverService.
   */
  async createFromAuthWithManager(
    manager: EntityManager,
    data: {
      nombre: string;
      apellido: string;
      celular: string;
    },
  ): Promise<{ businessUserId: string; publicId: string; alias: string }> {
    const businessRepo = manager.getRepository(BusinessUser);
    const publicId = await generatePublicId(businessRepo, 'USR');
    const alias = await this.generateAliasWithPrefix(businessRepo, 'Pasajero');

    // El ID se genera automáticamente (PrimaryGeneratedColumn)
    const businessUser = manager.create(BusinessUser, {
      publicId,
      alias,
    });

    const savedUser = await manager.save(businessUser);

    const profile = manager.create(UserProfile, {
      businessUserId: savedUser.id,
      nombre: data.nombre,
      apellido: data.apellido,
      celular: data.celular,
    });

    await manager.save(profile);

    this.logger.log(`Business user created with transaction: ${savedUser.id}`);

    return { businessUserId: savedUser.id, publicId, alias };
  }

  async updateProfile(
    businessUserId: string,
    dto: UpdateProfileDto,
    context?: AuthContext,
  ): Promise<{ message: string }> {
    const profile = await this.profileRepo.findOne({
      where: { businessUserId },
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

    this.logger.log(`Profile updated for business user: ${businessUserId}`);

    await this.auditService.logEvent({
      action: AuditAction.PROFILE_UPDATE,
      userId: businessUserId,
      result: AuditResult.SUCCESS,
      ipAddress: context?.ip,
      userAgent: context?.userAgent,
      metadata: { changes: dto },
    });

    return { message: ErrorMessages.USER.PROFILE_UPDATED };
  }

  /**
   * Soft delete del usuario de business.
   * NOTA: La invalidación del auth_user debe hacerse por separado en AuthService.
   */
  async softDeleteUser(
    businessUserId: string,
    context?: AuthContext,
  ): Promise<void> {
    const result = await this.businessUserRepo.update(
      { id: businessUserId, isDeleted: false },
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
    );

    if (result.affected === 0) {
      this.logger.warn(`User not found or already deleted: ${businessUserId}`);
    } else {
      await this.redisService.revokeUserSessions(
        businessUserId,
        this.getSessionRevokeTtlSeconds(),
      );

      this.logger.log(`User soft deleted: ${businessUserId}`);

      await this.auditService.logEvent({
        action: AuditAction.ACCOUNT_DEACTIVATED,
        userId: businessUserId,
        result: AuditResult.SUCCESS,
        ipAddress: context?.ip,
        userAgent: context?.userAgent,
      });
    }
  }

  async getDisplayName(businessUserId: string): Promise<string> {
    const user = await this.businessUserRepo.findOne({
      where: { id: businessUserId },
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

  async findById(businessUserId: string): Promise<BusinessUser | null> {
    return this.businessUserRepo.findOne({
      where: { id: businessUserId, isDeleted: false },
      relations: ['profile'],
    });
  }

  async getMyProfile(businessUserId: string) {
    const user = await this.businessUserRepo.findOne({
      where: { id: businessUserId, isDeleted: false },
      relations: ['profile'],
    });

    if (!user) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    if (!user.profile) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    // Obtener el authUserId usando el IdentityResolverService
    const authUserId =
      await this.identityResolver.resolveAuthUserId(businessUserId);

    // Buscar el email en la tabla de AuthUser
    let email: string | undefined = undefined;
    if (authUserId) {
      const authUser = await this.authUserRepo.findOne({
        where: { id: authUserId },
        select: ['email'],
      });
      email = authUser?.email;
    }

    const avatarUrl = user.profile.fotoPerfilUrl
      ? await this.storageService.getSignedUrl(
          this.config.getOrThrow('STORAGE_PROFILE_BUCKET'),
          user.profile.fotoPerfilUrl,
        )
      : await this.getDefaultAvatarUrl();

    // NOTA: email ya no está en business_users, debe obtenerse de auth si es necesario
    return {
      id: user.id,
      publicId: user.publicId,
      email,
      alias: user.alias,
      nombre: user.profile.nombre,
      apellido: user.profile.apellido,
      celular: user.profile.celular,
      avatarUrl,
      rating: user.profile.ratingPromedio,
      totalViajes: user.profile.totalViajes,
    };
  }

  async updateProfilePhoto(
    businessUserId: string,
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

    const profile = await this.profileRepo.findOne({
      where: { businessUserId },
    });

    if (!profile) {
      throw new NotFoundException(ErrorMessages.USER.PROFILE_NOT_FOUND);
    }

    const objectPath = await this.storageService.upload({
      bucket: this.config.getOrThrow('STORAGE_PROFILE_BUCKET'),
      folder: 'avatars',
      filename: `user-${businessUserId}.jpg`,
      buffer: file.buffer,
      mimetype: file.mimetype,
    });

    profile.fotoPerfilUrl = objectPath;
    await this.profileRepo.save(profile);

    await this.auditService.logEvent({
      action: AuditAction.PROFILE_PHOTO_UPDATE,
      userId: businessUserId,
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
