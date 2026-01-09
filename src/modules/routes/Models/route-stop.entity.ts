/**
 * Entidad TypeORM del modulo routes.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Route } from './route.entity';

@Entity({ schema: 'business', name: 'route_stops' })
@Unique('UQ_route_stops_route_orden', ['routeId', 'orden'])
@Index('IDX_route_stops_route_id', ['routeId'])
export class RouteStop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  @Column({ type: 'uuid' })
  routeId: string;

  @ManyToOne(() => Route, (route) => route.stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: Route;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lat: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  lng: number;

  @Column({ type: 'text' })
  direccion: string;

  @Column({ type: 'int' })
  orden: number;

  @CreateDateColumn()
  createdAt: Date;
}
