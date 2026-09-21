import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryColumn('varchar', { length: 36 })
  id!: string;

  @Index({ unique: true })
  @Column('varchar', { length: 64 })
  username!: string;

  @Column('varchar', { length: 255 })
  passwordHash!: string;

  @Column('varchar', { length: 16, default: 'user' })
  role!: 'admin' | 'user';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
