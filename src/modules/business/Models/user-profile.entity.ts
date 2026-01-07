import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { BusinessUser } from './business-user.entity';

/**
 * Perfil de usuario con datos personales y estadísticas.
 *
 * IMPORTANTE: businessUserId referencia a business.business_users.id,
 * NO a auth.auth_users.id. Los schemas están desacoplados.
 */
@Entity({ schema: 'business', name: 'user_profiles' })
@Index('IDX_user_profiles_rating_promedio', ['ratingPromedio'])
@Index('IDX_user_profiles_is_bloqueado_por_rating', ['isBloqueadoPorRating'])
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  businessUserId: string;

  @OneToOne(() => BusinessUser, (user) => user.profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessUserId' })
  user: BusinessUser;

  @Column({ type: 'varchar', length: 15 })
  nombre: string;

  @Column({ type: 'varchar', length: 15 })
  apellido: string;

  @Column({ type: 'varchar', length: 10 })
  celular: string;

  @Column({ type: 'text', nullable: true })
  fotoPerfilUrl: string | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5 })
  ratingPromedio: number;

  @Column({ type: 'int', default: 0 })
  totalViajes: number;

  @Column({ type: 'int', default: 0 })
  totalCalificaciones: number;

  @Column({ type: 'boolean', default: false })
  isBloqueadoPorRating: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
