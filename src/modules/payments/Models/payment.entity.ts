/**
 * Entidad TypeORM del modulo payments.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Booking } from '../../bookings/Models/booking.entity';
import { Payout } from './payout.entity';
import { MetodoPagoEnum, EstadoPagoEnum } from '../Enums';

@Entity({ schema: 'business', name: 'payments' })
@Index('IDX_payments_status', ['status'])
@Index('IDX_payments_method', ['method'])
@Index('IDX_payments_payout_id', ['payoutId'])
@Index('IDX_payments_paypal_order_id', ['paypalOrderId'])
@Index('IDX_payments_created_at', ['createdAt'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  @Column({ type: 'uuid', unique: true })
  bookingId: string;

  @OneToOne(() => Booking, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: MetodoPagoEnum,
  })
  method: MetodoPagoEnum;

  @Column({
    type: 'enum',
    enum: EstadoPagoEnum,
    default: EstadoPagoEnum.PENDING,
  })
  status: EstadoPagoEnum;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paypalOrderId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paypalCaptureId: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  payoutId: string | null;

  @ManyToOne(() => Payout, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payoutId' })
  payout: Payout | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reversedAt: Date | null;
}
