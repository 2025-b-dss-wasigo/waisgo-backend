import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { Credential } from './credential.entity';
import { RolUsuarioEnum } from '../Enum/users-roles.enum';
import { EstadoVerificacionEnum } from '../Enum/estado-ver.enum';

@Entity({ schema: 'auth', name: 'auth_users' })
@Index('IDX_auth_users_rol', ['rol'])
@Index('IDX_auth_users_estado_verificacion', ['estadoVerificacion'])
@Index('IDX_auth_users_bloqueado_hasta', ['bloqueadoHasta'])
export class AuthUser {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  email: string;

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

  @OneToOne(() => Credential, (c) => c.authUser, { cascade: true })
  credential: Credential;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
