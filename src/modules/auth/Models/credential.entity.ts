/**
 * Entidad TypeORM del modulo auth.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AuthUser } from './auth-user.entity';

@Entity({ schema: 'auth', name: 'credentials' })
@Index('IDX_credentials_failed_attempts', ['failedAttempts'])
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  authUserId: string;

  @OneToOne(() => AuthUser, (authUser) => authUser.credential, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'authUserId' })
  authUser: AuthUser;

  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ type: 'int', default: 0 })
  failedAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lastFailedAttempt: Date | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
