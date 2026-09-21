import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('system_config')
export class SystemConfigEntity {
  @PrimaryColumn('varchar', { length: 64 })
  key!: string;

  @Column('text')
  value!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
