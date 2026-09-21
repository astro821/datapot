import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { JsonSchema, PotField } from '@datapot/shared';

@Entity('datapots')
export class DataPotEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Index({ unique: true })
  @Column('varchar', { length: 128 })
  name!: string;

  /** URL path key — /api/{key}/data */
  @Index({ unique: true })
  @Column('varchar', { length: 64 })
  key!: string;

  @Column('text', { nullable: true })
  description?: string;

  @Index({ unique: true })
  @Column('int')
  port!: number;

  @Column('simple-json', { default: '[]' })
  fields!: PotField[];

  @Column('simple-json')
  schema!: JsonSchema;

  @Column('boolean', { default: true })
  enabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
