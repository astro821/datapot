import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Collection, Db, Document, MongoClient } from 'mongodb';
import { DbConfig } from '@datapot/shared';
import { BootstrapService } from '../bootstrap/bootstrap.service';
import { UserEntity } from './entities/user.entity';
import { SystemConfigEntity } from './entities/system-config.entity';
import { DataPotEntity } from './entities/datapot.entity';
import { PotRecordEntity } from './entities/pot-record.entity';

const SQL_ENTITIES = [
  UserEntity,
  SystemConfigEntity,
  DataPotEntity,
  PotRecordEntity,
];

export type StoreKind = 'sql' | 'mongo' | 'none';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private dataSource: DataSource | null = null;
  private mongo: MongoClient | null = null;
  private mongoDb: Db | null = null;
  private kind: StoreKind = 'none';
  private connectedConfig: DbConfig | null = null;

  constructor(private readonly bootstrap: BootstrapService) {}

  get storeKind(): StoreKind {
    return this.kind;
  }

  get isConnected(): boolean {
    return this.kind !== 'none';
  }

  /** Active SQL dialect when storeKind is sql */
  get sqlDialect(): 'sqlite' | 'mariadb' | null {
    if (this.kind !== 'sql' || !this.connectedConfig) return null;
    return this.connectedConfig.type === 'sqlite' ? 'sqlite' : 'mariadb';
  }

  async query(sql: string, parameters?: unknown[]): Promise<unknown> {
    if (!this.dataSource?.isInitialized) {
      throw new Error('SQL database not connected');
    }
    return this.dataSource.query(sql, parameters);
  }

  async connect(config?: DbConfig): Promise<void> {
    const db = config ?? this.bootstrap.config.db;
    if (!db) {
      this.kind = 'none';
      return;
    }

    await this.disconnect();
    this.connectedConfig = db;

    if (db.type === 'mongodb') {
      await this.connectMongo(db.url);
      this.kind = 'mongo';
      this.logger.log('Connected to MongoDB');
      return;
    }

    await this.connectSql(db);
    this.kind = 'sql';
    this.logger.log(`Connected to ${db.type}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async disconnect(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
    this.dataSource = null;
    if (this.mongo) {
      await this.mongo.close();
    }
    this.mongo = null;
    this.mongoDb = null;
    this.kind = 'none';
  }

  users(): Repository<UserEntity> {
    return this.sqlRepo(UserEntity);
  }

  datapots(): Repository<DataPotEntity> {
    return this.sqlRepo(DataPotEntity);
  }

  potRecords(): Repository<PotRecordEntity> {
    return this.sqlRepo(PotRecordEntity);
  }

  systemConfig(): Repository<SystemConfigEntity> {
    return this.sqlRepo(SystemConfigEntity);
  }

  mongoCollection<T extends Document>(name: string): Collection<T> {
    if (!this.mongoDb) throw new Error('MongoDB not connected');
    return this.mongoDb.collection<T>(name);
  }

  getMongoDb(): Db {
    if (!this.mongoDb) throw new Error('MongoDB not connected');
    return this.mongoDb;
  }

  private sqlRepo<T extends object>(entity: new () => T): Repository<T> {
    if (!this.dataSource?.isInitialized) {
      throw new Error('SQL database not connected');
    }
    return this.dataSource.getRepository(entity);
  }

  private async connectSql(db: DbConfig): Promise<void> {
    if (db.type === 'sqlite') {
      this.dataSource = new DataSource({
        type: 'better-sqlite3',
        database: db.url,
        entities: SQL_ENTITIES,
        synchronize: true,
      });
    } else {
      const parsed = this.parseMysqlUrl(db.url);
      this.dataSource = new DataSource({
        type: 'mariadb',
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        database: parsed.database,
        entities: SQL_ENTITIES,
        synchronize: true,
      });
    }
    await this.dataSource.initialize();
  }

  private async connectMongo(url: string): Promise<void> {
    this.mongo = new MongoClient(url);
    await this.mongo.connect();
    const dbName = this.extractMongoDbName(url) || 'datapot';
    this.mongoDb = this.mongo.db(dbName);
    await this.mongoDb.collection('users').createIndex({ username: 1 }, { unique: true });
    await this.mongoDb.collection('datapots').createIndex({ port: 1 }, { unique: true });
    await this.mongoDb.collection('datapots').createIndex({ name: 1 }, { unique: true });
    const records = this.mongoDb.collection('pot_records');
    await records.createIndex({ potId: 1 });
    await records.createIndex({ potId: 1, seq: 1 }, { unique: true });
    await records.createIndex({ potId: 1, priority: 1 });
    await records.createIndex({ potId: 1, confirmed: 1 });
    await records.updateMany({ priority: { $exists: false } }, { $set: { priority: 'none' } });
    await records.updateMany({ confirmed: { $exists: false } }, { $set: { confirmed: false } });
    await this.mongoDb.collection('pot_sequences').createIndex({ potId: 1 }, { unique: true });
  }

  private parseMysqlUrl(url: string): {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  } {
    const u = new URL(url);
    return {
      host: u.hostname || 'localhost',
      port: Number(u.port || 3306),
      username: decodeURIComponent(u.username || 'root'),
      password: decodeURIComponent(u.password || ''),
      database: (u.pathname || '/datapot').replace(/^\//, '') || 'datapot',
    };
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