/**
 * Entidad TypeORM del modulo drivers.
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
} from 'typeorm';
import { Driver } from './driver.entity';

@Entity({ schema: 'business', name: 'vehicles' })
@Index('IDX_vehicles_driver_id', ['driverId'])
@Index('IDX_vehicles_is_activo', ['isActivo'])
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, (driver) => driver.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({ type: 'varchar', length: 15 })
  marca: string;

  @Column({ type: 'varchar', length: 15 })
  modelo: string;

  @Column({ type: 'varchar', length: 10 })
  color: string;

  @Column({ type: 'varchar', length: 7, unique: true })
  placa: string;

  @Column({ type: 'int' })
  asientosDisponibles: number;

  @Column({ type: 'boolean', default: true })
  isActivo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
