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
  Unique,
} from 'typeorm';
import { Driver } from './driver.entity';
import { TipoDocumentoEnum, EstadoDocumentoEnum } from '../Enums';

@Entity({ schema: 'business', name: 'driver_documents' })
@Unique('UQ_driver_documents_driver_tipo', ['driverId', 'tipo'])
@Index('IDX_driver_documents_driver_id', ['driverId'])
@Index('IDX_driver_documents_estado', ['estado'])
export class DriverDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, (driver) => driver.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({
    type: 'enum',
    enum: TipoDocumentoEnum,
  })
  tipo: TipoDocumentoEnum;

  @Column({ type: 'text' })
  archivoUrl: string;

  @Column({
    type: 'enum',
    enum: EstadoDocumentoEnum,
    default: EstadoDocumentoEnum.PENDIENTE,
  })
  estado: EstadoDocumentoEnum;

  @Column({ type: 'text', nullable: true })
  motivoRechazo: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
