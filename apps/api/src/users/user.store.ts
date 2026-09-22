import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../database/database.service';

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
    if (!this.db.isConnected) return null;
    const row = await this.db.mongoCollection('users').findOne({ username });
    return row ? (row as unknown as UserRecord) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    if (!this.db.isConnected) return null;
    const row = await this.db.mongoCollection('users').findOne({ id });
    return row ? (row as unknown as UserRecord) : null;
  }

  async findAll(): Promise<UserRecord[]> {
    if (!this.db.isConnected) return [];
    const rows = await this.db.mongoCollection('users').find().sort({ createdAt: 1 }).toArray();
    return rows as unknown as UserRecord[];
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
    await this.db.mongoCollection('users').insertOne({ ...record });
    return record;
  }

  async update(
    id: string,
    patch: Partial<Pick<UserRecord, 'username' | 'passwordHash' | 'role'>>,
  ): Promise<UserRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: new Date() };
    await this.db.mongoCollection('users').updateOne({ id }, { $set: next });
    return next;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.db.isConnected) return false;
    const r = await this.db.mongoCollection('users').deleteOne({ id });
    return r.deletedCount > 0;
  }

  async count(): Promise<number> {
    if (!this.db.isConnected) return 0;
    return this.db.mongoCollection('users').countDocuments();
  }
}
