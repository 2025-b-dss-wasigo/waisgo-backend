import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
} from 'typeorm';
import { Credential } from './credentials.entity';

export type RolUsuario = 'USER' | 'PASAJERO' | 'CONDUCTOR' | 'ADMIN';
export type EstadoVerificacion = 'NO_VERIFICADO' | 'VERIFICADO';

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
    enum: ['USER', 'PASAJERO', 'CONDUCTOR', 'ADMIN'],
    default: 'USER',
  })
  rol: RolUsuario;

  @Column({
    type: 'enum',
    enum: ['NO_VERIFICADO', 'VERIFICADO'],
    default: 'NO_VERIFICADO',
  })
  estadoVerificacion: EstadoVerificacion;

  @Column({ type: 'timestamp', nullable: true })
  bloqueadoHasta: Date | null;

  @OneToOne(() => Credential, (c) => c.user, { cascade: true, eager: true })
  credential: Credential;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
