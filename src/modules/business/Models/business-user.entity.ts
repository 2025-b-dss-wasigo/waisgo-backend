/**
 * Entidad TypeORM del modulo business.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

/**
 * Entidad de usuario de negocio.
 *
 * IMPORTANTE: Esta entidad está DESACOPLADA de auth.auth_users.
 * - El id es un UUID generado automáticamente, NO el mismo que auth_users.id
 * - No hay columna email (está solo en auth.auth_users)
 * - La correlación se hace a través de audit.user_identity_map
 */
@Entity({ schema: 'business', name: 'business_users' })
@Index('IDX_business_users_is_deleted', ['isDeleted'])
@Index('IDX_business_users_created_at', ['createdAt'])
@Index('IDX_business_users_public_id', ['publicId'], { unique: true })
export class BusinessUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  // Email ELIMINADO - ahora solo existe en auth.auth_users
  // La correlación se hace a través del IdentityResolverService

  @Column({ type: 'varchar', length: 25, unique: true })
  alias: string;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @OneToOne(() => UserProfile, (p) => p.user, { cascade: true })
  profile: UserProfile;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
