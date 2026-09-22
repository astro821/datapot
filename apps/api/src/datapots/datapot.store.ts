import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { buildJsonSchemaFromFields, JsonSchema, PotField } from '@datapot/shared';
import { DatabaseService } from '../database/database.service';

export interface DataPotRecord {
  id: string;
  name: string;
  key: string;
  description?: string;
  port: number;
  fields: PotField[];
  schema: JsonSchema;
  enabled: boolean;
  apiTokenHash?: string | null;
  apiTokenExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DataPotStore {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<DataPotRecord[]> {
    if (!this.db.isConnected) return [];
    const rows = await this.db.mongoCollection('datapots').find().sort({ createdAt: 1 }).toArray();
    return rows.map((row) => this.normalize(row as unknown as DataPotRecord));
  }

  async findById(id: string): Promise<DataPotRecord | null> {
    if (!this.db.isConnected) return null;
    const row = await this.db.mongoCollection('datapots').findOne({ id });
    return row ? this.normalize(row as unknown as DataPotRecord) : null;
  }

  async findByName(name: string): Promise<DataPotRecord | null> {
    if (!this.db.isConnected) return null;
    const row = await this.db.mongoCollection('datapots').findOne({ name: name.trim() });
    return row ? this.normalize(row as unknown as DataPotRecord) : null;
  }

  async findByKey(key: string): Promise<DataPotRecord | null> {
    if (!this.db.isConnected) return null;
    const row = await this.db.mongoCollection('datapots').findOne({ key: key.trim().toLowerCase() });
    return row ? this.normalize(row as unknown as DataPotRecord) : null;
  }

  async findByPort(port: number): Promise<DataPotRecord | null> {
    if (!this.db.isConnected) return null;
    const row = await this.db.mongoCollection('datapots').findOne({ port });
    return row ? this.normalize(row as unknown as DataPotRecord) : null;
  }

  async create(input: {
    name: string;
    key: string;
    description?: string;
    port: number;
    fields?: PotField[];
    enabled?: boolean;
  }): Promise<DataPotRecord> {
    const now = new Date();
    const fields = input.fields ?? [];
    const record: DataPotRecord = {
      id: uuid(),
      name: input.name.trim(),
      key: input.key.trim().toLowerCase(),
      description: input.description,
      port: input.port,
      fields,
      schema: buildJsonSchemaFromFields(fields),
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.mongoCollection('datapots').insertOne({ ...record });
    return record;
  }

  async update(
    id: string,
    patch: Partial<
      Pick<DataPotRecord, 'name' | 'description' | 'port' | 'fields' | 'enabled'>
    >,
  ): Promise<DataPotRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<Pick<DataPotRecord, 'name' | 'description' | 'port' | 'fields' | 'enabled'>>;

    const fields = cleaned.fields !== undefined ? cleaned.fields : existing.fields;
    const schema =
      cleaned.fields !== undefined ? buildJsonSchemaFromFields(fields) : existing.schema;
    const next: DataPotRecord = {
      ...existing,
      ...cleaned,
      name: cleaned.name != null ? cleaned.name.trim() : existing.name,
      key: existing.key,
      fields,
      schema,
      updatedAt: new Date(),
    };
    await this.db.mongoCollection('datapots').updateOne({ id }, { $set: next });
    return next;
  }

  async setApiToken(id: string, hash: string, expiresAt: Date): Promise<DataPotRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next: DataPotRecord = {
      ...existing,
      apiTokenHash: hash,
      apiTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    };
    await this.db.mongoCollection('datapots').updateOne({ id }, { $set: next });
    return next;
  }

  async delete(id: string): Promise<boolean> {
    if (!this.db.isConnected) return false;
    const result = await this.db.mongoCollection('datapots').deleteOne({ id });
    return result.deletedCount > 0;
  }

  async count(): Promise<number> {
    if (!this.db.isConnected) return 0;
    return this.db.mongoCollection('datapots').countDocuments();
  }

  private normalize(row: DataPotRecord): DataPotRecord {
    const fields = Array.isArray(row.fields) ? row.fields : [];
    return {
      ...row,
      key: typeof row.key === 'string' ? row.key : '',
      fields,
      schema: row.schema?.type ? row.schema : buildJsonSchemaFromFields(fields),
      apiTokenExpiresAt: row.apiTokenExpiresAt ? new Date(row.apiTokenExpiresAt) : null,
    };
  }
}
