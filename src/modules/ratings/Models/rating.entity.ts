/**
 * Entidad TypeORM del modulo ratings.
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
import { BusinessUser } from '../../business/Models/business-user.entity';
import { Route } from '../../routes/Models/route.entity';

@Entity({ schema: 'business', name: 'ratings' })
@Unique('UQ_ratings_from_to_route', ['fromUserId', 'toUserId', 'routeId'])
@Index('IDX_ratings_from_user_id', ['fromUserId'])
@Index('IDX_ratings_to_user_id', ['toUserId'])
@Index('IDX_ratings_route_id', ['routeId'])
@Index('IDX_ratings_created_at', ['createdAt'])
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 12, unique: true })
  publicId: string;

  @Column({ type: 'uuid' })
  fromUserId: string;

  @ManyToOne(() => BusinessUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fromUserId' })
  fromUser: BusinessUser;

  @Column({ type: 'uuid' })
  toUserId: string;

  @ManyToOne(() => BusinessUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'toUserId' })
  toUser: BusinessUser;

  @Column({ type: 'uuid' })
  routeId: string;

  @ManyToOne(() => Route, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route: Route;

  @Column({ type: 'int' }) // 1-5
  score: number;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
