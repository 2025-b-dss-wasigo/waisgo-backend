import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { UserIdentityMap } from './user-identity-map.entity';
import { IdentityHashService } from './identity-hash.service';
import { ErrorMessages } from '../common/constants/error-messages.constant';

export interface ResolvedIdentity {
  authUserId: string;
  businessUserId: string;
  deterministicHash: string;
}

export interface CreateMappingData {
  email: string;
  createdAt: Date;
}

/**
 * Servicio para resolver identidades entre los schemas auth y business.
 *
 * Este servicio es el ÚNICO punto de correlación entre ambos schemas.
 * Sin las claves de encriptación, es imposible determinar qué usuario
 * de auth corresponde a qué usuario de business.
 */
@Injectable()
export class IdentityResolverService {
  private readonly logger = new Logger(IdentityResolverService.name);

  constructor(
    @InjectRepository(UserIdentityMap)
    private readonly identityMapRepo: Repository<UserIdentityMap>,
    private readonly hashService: IdentityHashService,
  ) {}

  /**
   * Crea un nuevo mapeo de identidad durante el registro.
   * Debe llamarse dentro de una transacción.
   *
   * @param authUserId - UUID del usuario en auth schema
   * @param businessUserId - UUID del usuario en business schema
   * @param userData - Datos inmutables para generar el hash determinístico
   */
  async createMapping(
    authUserId: string,
    businessUserId: string,
    userData: CreateMappingData,
  ): Promise<UserIdentityMap> {
    const deterministicHash =
      this.hashService.generateDeterministicHash(userData);

    const mapping = this.identityMapRepo.create({
      authUserIdEncrypted: this.hashService.encrypt(authUserId),
      businessUserIdEncrypted: this.hashService.encrypt(businessUserId),
      deterministicHash,
    });

    const saved = await this.identityMapRepo.save(mapping);
    this.logger.log(
      `Identity mapping created for hash: ${deterministicHash.substring(0, 8)}...`,
    );

    return saved;
  }

  /**
   * Crea un nuevo mapeo de identidad usando un EntityManager (para transacciones).
   *
   * @param manager - EntityManager de la transacción
   * @param authUserId - UUID del usuario en auth schema
   * @param businessUserId - UUID del usuario en business schema
   * @param userData - Datos inmutables para generar el hash determinístico
   */
  async createMappingWithManager(
    manager: EntityManager,
    authUserId: string,
    businessUserId: string,
    userData: CreateMappingData,
  ): Promise<UserIdentityMap> {
    const deterministicHash =
      this.hashService.generateDeterministicHash(userData);

    const mapping = manager.create(UserIdentityMap, {
      authUserIdEncrypted: this.hashService.encrypt(authUserId),
      businessUserIdEncrypted: this.hashService.encrypt(businessUserId),
      deterministicHash,
    });

    const saved = await manager.save(mapping);
    this.logger.log(
      `Identity mapping created with manager for hash: ${deterministicHash.substring(0, 8)}...`,
    );

    return saved;
  }

  /**
   * Resuelve businessUserId desde authUserId.
   * Usado internamente cuando el servidor conoce el authUserId (ej: después de login).
   *
   * NOTA: Esta operación requiere iterar sobre todos los mapeos y descifrar.
   * Para mejor rendimiento en producción, considera agregar un cache en Redis.
   *
   * @param authUserId - UUID del usuario en auth schema
   * @returns UUID del usuario en business schema
   * @throws NotFoundException si no se encuentra el mapeo
   */
  async resolveBusinessUserId(authUserId: string): Promise<string> {
    const mappings = await this.identityMapRepo.find();

    for (const mapping of mappings) {
      try {
        const decryptedAuthId = this.hashService.decrypt(
          mapping.authUserIdEncrypted,
        );
        if (decryptedAuthId === authUserId) {
          return this.hashService.decrypt(mapping.businessUserIdEncrypted);
        }
      } catch {
        // Continuar con el siguiente si hay error de descifrado
        continue;
      }
    }

    throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
  }

  /**
   * Resuelve authUserId desde businessUserId.
   * Usado para operaciones que requieren acceso a auth (ej: cambio de contraseña).
   *
   * @param businessUserId - UUID del usuario en business schema
   * @returns UUID del usuario en auth schema
   * @throws NotFoundException si no se encuentra el mapeo
   */
  async resolveAuthUserId(businessUserId: string): Promise<string> {
    const mappings = await this.identityMapRepo.find();

    for (const mapping of mappings) {
      try {
        const decryptedBusinessId = this.hashService.decrypt(
          mapping.businessUserIdEncrypted,
        );
        if (decryptedBusinessId === businessUserId) {
          return this.hashService.decrypt(mapping.authUserIdEncrypted);
        }
      } catch {
        continue;
      }
    }

    throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
  }

  /**
   * Resuelve identidad completa usando el hash determinístico.
   * Útil para operaciones de auditoría y recuperación.
   *
   * @param deterministicHash - Hash determinístico
   * @returns Identidad resuelta con ambos UUIDs
   * @throws NotFoundException si no se encuentra el mapeo
   */
  async resolveByHash(deterministicHash: string): Promise<ResolvedIdentity> {
    const mapping = await this.identityMapRepo.findOne({
      where: { deterministicHash },
    });

    if (!mapping) {
      throw new NotFoundException(ErrorMessages.USER.NOT_FOUND);
    }

    return {
      authUserId: this.hashService.decrypt(mapping.authUserIdEncrypted),
      businessUserId: this.hashService.decrypt(mapping.businessUserIdEncrypted),
      deterministicHash: mapping.deterministicHash,
    };
  }

  /**
   * Obtiene el hash determinístico para un authUserId.
   * Útil para auditoría.
   *
   * @param authUserId - UUID del usuario en auth schema
   * @returns Hash determinístico o null si no se encuentra
   */
  async getDeterministicHash(authUserId: string): Promise<string | null> {
    const mappings = await this.identityMapRepo.find();

    for (const mapping of mappings) {
      try {
        const decryptedAuthId = this.hashService.decrypt(
          mapping.authUserIdEncrypted,
        );
        if (decryptedAuthId === authUserId) {
          return mapping.deterministicHash;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Elimina el mapeo de identidad (para eliminación completa de cuenta).
   *
   * @param authUserId - UUID del usuario en auth schema
   */
  async deleteMapping(authUserId: string): Promise<void> {
    const mappings = await this.identityMapRepo.find();

    for (const mapping of mappings) {
      try {
        const decryptedAuthId = this.hashService.decrypt(
          mapping.authUserIdEncrypted,
        );
        if (decryptedAuthId === authUserId) {
          await this.identityMapRepo.remove(mapping);
          this.logger.log(
            `Identity mapping deleted for hash: ${mapping.deterministicHash.substring(0, 8)}...`,
          );
          return;
        }
      } catch {
        continue;
      }
    }
  }

  /**
   * Elimina el mapeo de identidad usando EntityManager (para transacciones).
   *
   * @param manager - EntityManager de la transacción
   * @param authUserId - UUID del usuario en auth schema
   */
  async deleteMappingWithManager(
    manager: EntityManager,
    authUserId: string,
  ): Promise<void> {
    const identityRepo = manager.getRepository(UserIdentityMap);
    const mappings = await identityRepo.find();

    for (const mapping of mappings) {
      try {
        const decryptedAuthId = this.hashService.decrypt(
          mapping.authUserIdEncrypted,
        );
        if (decryptedAuthId === authUserId) {
          await identityRepo.remove(mapping);
          this.logger.log(
            `Identity mapping deleted with manager for hash: ${mapping.deterministicHash.substring(0, 8)}...`,
          );
          return;
        }
      } catch {
        continue;
      }
    }
  }
}
