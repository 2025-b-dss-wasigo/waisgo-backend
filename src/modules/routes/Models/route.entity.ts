/**
 * Entidad TypeORM del modulo routes.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Driver } from '../../drivers/Models/driver.entity';
import { RouteStop } from './route-stop.entity';
import { CampusOrigenEnum, EstadoRutaEnum } from '../Enums';

@Entity({ schema: 'business', name: 'routes' })
@Index('IDX_routes_driver_id', ['driverId'])
@Index('IDX_routes_estado', ['estado'])
@Index('IDX_routes_fecha_hora_salida', ['fecha', 'horaSalida'])
@Index('IDX_routes_origen_fecha', ['origen', 'fecha'])
export class Route {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  @Column({ type: 'uuid' })
  driverId: string;

  @ManyToOne(() => Driver, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'driverId' })
  driver: Driver;

  @Column({
    type: 'enum',
    enum: CampusOrigenEnum,
  })
  origen: CampusOrigenEnum;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'time' })
  horaSalida: string;

  @Column({ type: 'text' })
  destinoBase: string;

  @Column({ type: 'int' })
  asientosTotales: number;

  @Column({ type: 'int' })
  asientosDisponibles: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  precioPasajero: number;

  @Column({
    type: 'enum',
    enum: EstadoRutaEnum,
    default: EstadoRutaEnum.ACTIVA,
  })
  estado: EstadoRutaEnum;

  @Column({ type: 'text', nullable: true })
  mensaje: string | null;

  @Column({ type: 'text', nullable: true })
  polyline: string | null;

  @OneToMany(() => RouteStop, (stop) => stop.route, { cascade: true })
  stops: RouteStop[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;
}
