/**
 * Entidad TypeORM del modulo payments.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Driver } from '../../drivers/Models/driver.entity';
import { EstadoPayoutEnum } from '../Enums';

@Entity({ schema: 'business', name: 'payouts' })
@Unique('UQ_payouts_driver_period', ['driverId', 'period'])
@Index('IDX_payouts_status', ['status'])
@Index('IDX_payouts_created_at', ['createdAt'])
export class Payout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({ type: 'varchar', length: 7 }) // YYYY-MM
  period: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: EstadoPayoutEnum,
    default: EstadoPayoutEnum.PENDING,
  })
  status: EstadoPayoutEnum;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paypalBatchId: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;
}
