import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AuditAction } from '../Enums/audit-actions.enum';
import { AuditResult } from '../Enums/audit-result.enum';

@Entity({ schema: 'audit', name: 'audit_logs' })
@Index('IDX_audit_logs_action', ['action'])
@Index('IDX_audit_logs_user_id', ['userId'])
@Index('IDX_audit_logs_created_at', ['createdAt'])
@Index('IDX_audit_logs_result', ['result'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({
    type: 'enum',
    enum: AuditResult,
    nullable: true,
  })
  result: AuditResult | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
