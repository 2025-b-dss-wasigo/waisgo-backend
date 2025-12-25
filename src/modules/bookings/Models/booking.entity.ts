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
import { Route } from '../../routes/Models/route.entity';
import { BusinessUser } from '../../business/Models/business-user.entity';
import { EstadoReservaEnum } from '../Enums/estado-reserva.enum';
import { MetodoPagoEnum } from '../../payments/Enums/metodo-pago.enum';

@Entity({ schema: 'business', name: 'bookings' })
@Unique('UQ_bookings_route_passenger', ['routeId', 'passengerId'])
@Index('IDX_bookings_route_id', ['routeId'])
@Index('IDX_bookings_passenger_id', ['passengerId'])
@Index('IDX_bookings_estado', ['estado'])
@Index('IDX_bookings_created_at', ['createdAt'])
@Index('IDX_bookings_passenger_estado', ['passengerId', 'estado'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  routeId: string;

  @ManyToOne(() => Route, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: Route;

  @Column({ type: 'uuid' })
  passengerId: string;

  @ManyToOne(() => BusinessUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'passengerId' })
  passenger: BusinessUser;

  @Column({
    type: 'enum',
    enum: EstadoReservaEnum,
    default: EstadoReservaEnum.CONFIRMADA,
  })
  estado: EstadoReservaEnum;

  @Column({ type: 'varchar', length: 6 })
  otp: string;

  @Column({ type: 'boolean', default: false })
  otpUsado: boolean;

  @Column({
    type: 'enum',
    enum: MetodoPagoEnum,
  })
  metodoPago: MetodoPagoEnum;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date | null;
}
