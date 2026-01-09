/**
 * Entidad TypeORM del modulo identity.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tabla de mapeo entre auth y business.
 *
 * SEGURIDAD: Los campos authUserId y businessUserId están encriptados
 * con AES-256-GCM. Solo el servidor con la clave puede descifrarlos.
 *
 * Si un atacante roba la base de datos:
 * - No puede leer los UUIDs reales (están encriptados)
 * - El deterministicHash no revela información del usuario
 * - No hay forma de correlacionar auth_users con business_users
 */
@Entity({ schema: 'audit', name: 'user_identity_map' })
@Index('IDX_user_identity_map_deterministic_hash', ['deterministicHash'], {
  unique: true,
})
export class UserIdentityMap {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * UUID del usuario en auth.auth_users (ENCRIPTADO con AES-256-GCM)
   */
  @Column({ type: 'text' })
  authUserIdEncrypted: string;

  /**
   * UUID del usuario en business.business_users (ENCRIPTADO con AES-256-GCM)
   */
  @Column({ type: 'text' })
  businessUserIdEncrypted: string;

  /**
   * Hash determinístico derivado de datos inmutables.
   * Se usa para buscar el mapeo sin exponer UUIDs.
   * Generado con HMAC-SHA256 de email + createdAt
   */
  @Column({ type: 'varchar', length: 32, unique: true })
  deterministicHash: string;

  @CreateDateColumn()
  createdAt: Date;
}
