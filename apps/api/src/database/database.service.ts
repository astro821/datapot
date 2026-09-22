import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Collection, Db, Document, MongoClient } from 'mongodb';
import {
  DbConfig,
  isValidPotKey,
  migratePotKey,
  recordCollectionName,
} from '@datapot/shared';
import { BootstrapService } from '../bootstrap/bootstrap.service';

export type StoreKind = 'mongo' | 'none';

interface PotDoc {
  id: string;
  key?: string;
  name?: string;
  fields?: { slug?: string; type?: string }[];
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private mongo: MongoClient | null = null;
  private mongoDb: Db | null = null;
  private kind: StoreKind = 'none';

  constructor(private readonly bootstrap: BootstrapService) {}

  get storeKind(): StoreKind {
    return this.kind;
  }

  get isConnected(): boolean {
    return this.kind === 'mongo';
  }

  async connect(config?: DbConfig): Promise<void> {
    const db = config ?? this.bootstrap.config.db;
    if (!db) {
      this.kind = 'none';
      return;
    }
    if (db.type !== 'mongodb') {
      throw new Error('Only MongoDB is supported');
    }
    if (!/^mongodb(\+srv)?:\/\//.test(db.url)) {
      throw new Error('MongoDB URL must start with mongodb:// or mongodb+srv://');
    }

    await this.disconnect();
    this.mongo = new MongoClient(db.url);
    await this.mongo.connect();
    const dbName = this.extractMongoDbName(db.url) || 'datapot';
    this.mongoDb = this.mongo.db(dbName);
    this.kind = 'mongo';
    await this.ensureCoreIndexes();
    await this.migrateLegacyRecords();
    this.logger.log('Connected to MongoDB');
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async disconnect(): Promise<void> {
    if (this.mongo) {
      await this.mongo.close();
    }
    this.mongo = null;
    this.mongoDb = null;
    this.kind = 'none';
  }

  mongoCollection<T extends Document>(name: string): Collection<T> {
    if (!this.mongoDb) throw new Error('MongoDB not connected');
    return this.mongoDb.collection<T>(name);
  }

  records<T extends Document>(key: string): Collection<T> {
    return this.mongoCollection<T>(recordCollectionName(key));
  }

  async ensureRecordIndexes(
    key: string,
    fields: { slug?: string; type?: string }[],
  ): Promise<void> {
    if (!isValidPotKey(key)) return;
    const col = this.records(key);
    await col.createIndex({ id: 1 }, { unique: true, name: 'id_unique' });
    await col.createIndex({ seq: 1 }, { unique: true, name: 'seq_unique' });
    await col.createIndex({ priority: 1 }, { name: 'priority' });
    await col.createIndex({ confirmed: 1 }, { name: 'confirmed' });
    const wanted = new Set(
      fields
        .filter((field) => field.type === 'type' && field.slug && /^[a-z0-9_]+$/.test(field.slug))
        .map((field) => field.slug as string),
    );
    const indexes = await col.indexes();
    for (const idx of indexes) {
      if (!idx.name?.startsWith('type_')) continue;
      const slug = idx.name.slice('type_'.length);
      if (!wanted.has(slug)) await col.dropIndex(idx.name);
    }
    for (const slug of wanted) {
      await col.createIndex({ [`payload.${slug}`]: 1 }, { name: `type_${slug}` });
    }
  }

  async dropRecordCollection(key: string): Promise<void> {
    if (!this.mongoDb || !isValidPotKey(key)) return;
    const name = recordCollectionName(key);
    const exists = await this.mongoDb.listCollections({ name }).hasNext();
    if (exists) await this.mongoDb.collection(name).drop();
  }

  private async ensureCoreIndexes(): Promise<void> {
    if (!this.mongoDb) return;
    await this.mongoDb.collection('users').createIndex({ username: 1 }, { unique: true });
    await this.mongoDb.collection('datapots').createIndex({ port: 1 }, { unique: true });
    await this.mongoDb.collection('datapots').createIndex({ name: 1 }, { unique: true });
    await this.mongoDb.collection('datapots').createIndex({ key: 1 }, { unique: true });
    await this.mongoDb.collection('pot_sequences').createIndex({ potId: 1 }, { unique: true });
  }

  /**
   * One shared `pot_records` collection is renamed to `data_raw_<key>` when it
   * holds a single pot. Several pots are moved per key, then the shared
   * collection is dropped. Legacy keys that contain `-` or exceed 32 characters
   * are rewritten before the collection name is chosen.
   */
  private async migrateLegacyRecords(): Promise<void> {
    if (!this.mongoDb) return;
    const potsCol = this.mongoDb.collection<PotDoc>('datapots');
    const pots = await potsCol.find().toArray();
    const taken = new Set<string>();
    for (const pot of pots) {
      const current = typeof pot.key === 'string' ? pot.key : '';
      if (isValidPotKey(current) && !taken.has(current)) {
        taken.add(current);
        continue;
      }
      const key = migratePotKey(current || pot.name || 'pot', taken);
      await potsCol.updateOne({ id: pot.id }, { $set: { key } });
      pot.key = key;
      taken.add(key);
      this.logger.log(`Rewrote pot key "${current}" → "${key}"`);
    }

    const legacyExists = await this.mongoDb.listCollections({ name: 'pot_records' }).hasNext();
    if (legacyExists) {
      const legacy = this.mongoDb.collection('pot_records');
      const potIds = (await legacy.distinct('potId')).map((id) => String(id)).filter(Boolean);
      if (potIds.length === 1) {
        const pot = pots.find((row) => row.id === potIds[0]);
        if (pot?.key && isValidPotKey(pot.key)) {
          const target = recordCollectionName(pot.key);
          const targetExists = await this.mongoDb.listCollections({ name: target }).hasNext();
          if (!targetExists) {
            await legacy.rename(target);
            this.logger.log(`Renamed pot_records → ${target}`);
          }
        }
      } else if (potIds.length > 1) {
        for (const potId of potIds) {
          const pot = pots.find((row) => row.id === potId);
          if (!pot?.key || !isValidPotKey(pot.key)) continue;
          const target = this.records(pot.key);
          const docs = await legacy.find({ potId }).toArray();
          if (docs.length === 0) continue;
          const rows = docs.map((doc) => {
            const { _id: _ignored, ...rest } = doc;
            return rest;
          });
          await target.insertMany(rows);
        }
        await legacy.drop();
        this.logger.log(`Split pot_records into ${potIds.length} pot collections`);
      }
    }

    const fresh = await potsCol.find().toArray();
    for (const pot of fresh) {
      if (!pot.key || !isValidPotKey(pot.key)) continue;
      await this.ensureRecordIndexes(pot.key, pot.fields ?? []);
    }
  }

  private extractMongoDbName(url: string): string | null {
    try {
      const u = new URL(url);
      const name = u.pathname.replace(/^\//, '');
      return name || null;
    } catch {
      return null;
    }
  }
}
