import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import type { PotPriority } from '@datapot/shared';

@Entity('pot_records')
@Index(['potId', 'seq'], { unique: true })
@Index(['potId', 'priority'])
@Index(['potId', 'confirmed'])
export class PotRecordEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Index()
  @Column('varchar', { length: 36 })
  potId!: string;

  /** Per-pot monotonic sequence (from pot sequence) */
  @Column('bigint', { default: 0 })
  seq!: number;

  @Column('simple-json')
  payload!: Record<string, unknown>;

  /** Admin-only. none | low | medium | high */
  @Column('varchar', { length: 16, default: 'none' })
  priority!: PotPriority;

  /** Admin-only. Whether an admin has reviewed the record. */
  @Column('boolean', { default: false })
  confirmed!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
