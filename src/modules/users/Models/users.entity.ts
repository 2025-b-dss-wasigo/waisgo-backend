import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { Credential } from './credentials.entity';
import { RolUsuarioEnum } from '../Enums/users-roles.enum';
import { EstadoVerificacionEnum } from '../Enums/estado-ver.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 30, unique: true })
  email: string;

  @Column({ length: 15 })
  nombre: string;

  @Column({ length: 15 })
  apellido: string;

  @Column({ length: 10 })
  celular: string;

  @Column({ length: 25, unique: true })
  alias: string;

  @Column({
    type: 'enum',
    enum: RolUsuarioEnum,
    default: RolUsuarioEnum.USER,
  })
  rol: RolUsuarioEnum;

  @Column({
    type: 'enum',
    enum: EstadoVerificacionEnum,
    default: EstadoVerificacionEnum.NO_VERIFICADO,
  })
  estadoVerificacion: EstadoVerificacionEnum;

  @Column({ type: 'timestamp', nullable: true })
  bloqueadoHasta: Date | null;

  @OneToOne(() => Credential, (c) => c.user, { cascade: true, eager: true })
  credential: Credential;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
