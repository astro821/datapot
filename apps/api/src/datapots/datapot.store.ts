import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  buildJsonSchemaFromFields,
  JsonSchema,
  normalizePotKey,
  PotField,
} from '@datapot/shared';
import { DatabaseService } from '../database/database.service';
import { DataPotEntity } from '../database/entities/datapot.entity';

export interface DataPotRecord {
  id: string;
  name: string;
  key: string;
  description?: string;
  port: number;
  fields: PotField[];
  schema: JsonSchema;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class DataPotStore {
  constructor(private readonly db: DatabaseService) {}

  async findAll(): Promise<DataPotRecord[]> {
    if (this.db.storeKind === 'sql') {
      const rows = await this.db.datapots().find({ order: { createdAt: 'ASC' } });
      return rows.map((r) => this.fromEntity(r));
    }
    if (this.db.storeKind === 'mongo') {
      const rows = await this.db
        .mongoCollection('datapots')
        .find()
        .sort({ createdAt: 1 })
        .toArray();
      return rows.map((r) => this.normalize(r as unknown as DataPotRecord));
    }
    return [];
  }

  async findById(id: string): Promise<DataPotRecord | null> {
    if (this.db.storeKind === 'sql') {
      const row = await this.db.datapots().findOne({ where: { id } });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db.mongoCollection('datapots').findOne({ id });
      return row ? this.normalize(row as unknown as DataPotRecord) : null;
    }
    return null;
  }

  async findByName(name: string): Promise<DataPotRecord | null> {
    const trimmed = name.trim();
    if (this.db.storeKind === 'sql') {
      const row = await this.db.datapots().findOne({ where: { name: trimmed } });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db.mongoCollection('datapots').findOne({ name: trimmed });
      return row ? this.normalize(row as unknown as DataPotRecord) : null;
    }
    return null;
  }

  async findByKey(key: string): Promise<DataPotRecord | null> {
    const k = normalizePotKey(key);
    if (this.db.storeKind === 'sql') {
      const row = await this.db.datapots().findOne({ where: { key: k } });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db.mongoCollection('datapots').findOne({ key: k });
      return row ? this.normalize(row as unknown as DataPotRecord) : null;
    }
    return null;
  }

  async findByPort(port: number): Promise<DataPotRecord | null> {
    if (this.db.storeKind === 'sql') {
      const row = await this.db.datapots().findOne({ where: { port } });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db.mongoCollection('datapots').findOne({ port });
      return row ? this.normalize(row as unknown as DataPotRecord) : null;
    }
    return null;
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
      key: normalizePotKey(input.key),
      description: input.description,
      port: input.port,
      fields,
      schema: buildJsonSchemaFromFields(fields),
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    if (this.db.storeKind === 'sql') {
      await this.db.datapots().save(record as DataPotEntity);
      return record;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('datapots').insertOne({ ...record });
      return record;
    }
    throw new Error('Database not connected');
  }

  async update(
    id: string,
    patch: Partial<
      Pick<DataPotRecord, 'name' | 'key' | 'description' | 'port' | 'fields' | 'enabled'>
    >,
  ): Promise<DataPotRecord | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Partial<
      Pick<DataPotRecord, 'name' | 'key' | 'description' | 'port' | 'fields' | 'enabled'>
    >;

    const fields = cleaned.fields !== undefined ? cleaned.fields : existing.fields;
    const schema =
      cleaned.fields !== undefined
        ? buildJsonSchemaFromFields(fields)
        : existing.schema;
    const next: DataPotRecord = {
      ...existing,
      ...cleaned,
      name: cleaned.name != null ? cleaned.name.trim() : existing.name,
      key: cleaned.key != null ? normalizePotKey(cleaned.key) : existing.key,
      fields,
      schema,
      updatedAt: new Date(),
    };
    if (this.db.storeKind === 'sql') {
      await this.db.datapots().save(next as DataPotEntity);
      return next;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('datapots').updateOne({ id }, { $set: next });
      return next;
    }
    throw new Error('Database not connected');
  }

  async delete(id: string): Promise<boolean> {
    if (this.db.storeKind === 'sql') {
      const r = await this.db.datapots().delete({ id });
      return (r.affected ?? 0) > 0;
    }
    if (this.db.storeKind === 'mongo') {
      const r = await this.db.mongoCollection('datapots').deleteOne({ id });
      return r.deletedCount > 0;
    }
    return false;
  }

  async count(): Promise<number> {
    if (this.db.storeKind === 'sql') return this.db.datapots().count();
    if (this.db.storeKind === 'mongo') {
      return this.db.mongoCollection('datapots').countDocuments();
    }
    return 0;
  }

  private fromEntity(row: DataPotEntity): DataPotRecord {
    return this.normalize({
      id: row.id,
      name: row.name,
      key: row.key,
      description: row.description,
      port: row.port,
      fields: row.fields,
      schema: row.schema,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private normalize(row: DataPotRecord): DataPotRecord {
    const fields = Array.isArray(row.fields) ? row.fields : [];
    const key =
      typeof row.key === 'string' && row.key.trim()
        ? normalizePotKey(row.key)
        : normalizePotKey(row.name);
    return {
      ...row,
      key,
      fields,
      schema: row.schema?.type
        ? row.schema
        : buildJsonSchemaFromFields(fields),
    };
  }
}
