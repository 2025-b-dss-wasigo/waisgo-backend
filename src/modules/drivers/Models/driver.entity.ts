import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { BusinessUser } from '../../business/Models/business-user.entity';
import { DriverDocument } from './driver-document.entity';
import { Vehicle } from './vehicle.entity';
import { EstadoConductorEnum } from '../Enums/estado-conductor.enum';

@Entity({ schema: 'business', name: 'drivers' })
@Index('IDX_drivers_estado', ['estado'])
@Index('IDX_drivers_fecha_solicitud', ['fechaSolicitud'])
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => BusinessUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: BusinessUser;

  @Column({ type: 'varchar', length: 254 })
  paypalEmail: string;

  @Column({
    type: 'enum',
    enum: EstadoConductorEnum,
    default: EstadoConductorEnum.PENDIENTE,
  })
  estado: EstadoConductorEnum;

  @CreateDateColumn()
  fechaSolicitud: Date;

  @Column({ type: 'timestamp', nullable: true })
  fechaAprobacion: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  fechaRechazo: Date | null;

  @Column({ type: 'text', nullable: true })
  motivoRechazo: string | null;

  @OneToMany(() => DriverDocument, (doc) => doc.driver, { cascade: true })
  documents: DriverDocument[];

  @OneToMany(() => Vehicle, (vehicle) => vehicle.driver, { cascade: true })
  vehicles: Vehicle[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
