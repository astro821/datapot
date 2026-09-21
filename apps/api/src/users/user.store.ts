import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { UserEntity } from '../database/entities/user.entity';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: 'admin' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserStore {
  constructor(private readonly db: DatabaseService) {}

  async findByUsername(username: string): Promise<UserRecord | null> {
    if (this.db.storeKind === 'sql') {
      const row = await this.db.users().findOne({ where: { username } });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db.mongoCollection('users').findOne({ username });
      return row ? (row as unknown as UserRecord) : null;
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    if (this.db.storeKind === 'sql') {
      const row = await this.db.users().findOne({ where: { id } });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db.mongoCollection('users').findOne({ id });
      return row ? (row as unknown as UserRecord) : null;
    }
    return null;
  }

  async findAll(): Promise<UserRecord[]> {
    if (this.db.storeKind === 'sql') {
      const rows = await this.db.users().find({ order: { createdAt: 'ASC' } });
      return rows.map((r) => this.fromEntity(r));
    }
    if (this.db.storeKind === 'mongo') {
      const rows = await this.db
        .mongoCollection('users')
        .find()
        .sort({ createdAt: 1 })
        .toArray();
      return rows as unknown as UserRecord[];
    }
    return [];
  }

  async create(input: {
    username: string;
    passwordHash: string;
    role: 'admin' | 'user';
  }): Promise<UserRecord> {
    const now = new Date();
    const record: UserRecord = {
      id: uuid(),
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    if (this.db.storeKind === 'sql') {
      await this.db.users().save(record as UserEntity);
      return record;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('users').insertOne({ ...record });
      return record;
    }
    throw new Error('Database not connected');
  }

  async update(
    id: string,
    patch: Partial<Pick<UserRecord, 'username' | 'passwordHash' | 'role'>>,
  ): Promise<UserRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: new Date() };
    if (this.db.storeKind === 'sql') {
      await this.db.users().save(next as UserEntity);
      return next;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('users').updateOne({ id }, { $set: next });
      return next;
    }
    throw new Error('Database not connected');
  }

  async delete(id: string): Promise<boolean> {
    if (this.db.storeKind === 'sql') {
      const r = await this.db.users().delete({ id });
      return (r.affected ?? 0) > 0;
    }
    if (this.db.storeKind === 'mongo') {
      const r = await this.db.mongoCollection('users').deleteOne({ id });
      return r.deletedCount > 0;
    }
    return false;
  }

  async count(): Promise<number> {
    if (this.db.storeKind === 'sql') {
      return this.db.users().count();
    }
    if (this.db.storeKind === 'mongo') {
      return this.db.mongoCollection('users').countDocuments();
    }
    return 0;
  }

  private fromEntity(row: UserEntity): UserRecord {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      role: row.role,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
