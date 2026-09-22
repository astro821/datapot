import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Collection, Db, Document, MongoClient } from 'mongodb';
import { DbConfig, isValidPotKey, recordCollectionName } from '@datapot/shared';
import { BootstrapService } from '../bootstrap/bootstrap.service';

export type StoreKind = 'mongo' | 'none';

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
    await col.createIndex({ createdAt: 1, seq: 1 }, { name: 'createdAt_seq' });
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
