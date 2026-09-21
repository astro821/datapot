import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  APP_VERSION,
  DbConfig,
  ExternalConnection,
  RunMode,
} from '@datapot/shared';

export interface RuntimeConfig {
  mode: RunMode;
  db: DbConfig | null;
  external: ExternalConnection | null;
  dataDir: string;
  configPath: string;
  adminPasswordOverride?: string;
  /** True when process started with single / DPOT_MODE=single */
  preferSingleDataDir: boolean;
}

/** On-disk config.json shape (supports legacy flat DbConfig) */
interface StoredConfigFile {
  db?: DbConfig | null;
  external?: ExternalConnection | null;
  /** legacy */
  type?: DbConfig['type'];
  url?: string;
}

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);
  private _mode: RunMode = 'uninitialized';
  private _config: RuntimeConfig | null = null;
  private _ready = false;

  get mode(): RunMode {
    return this._mode;
  }

  get ready(): boolean {
    return this._ready;
  }

  get config(): RuntimeConfig {
    if (!this._config) {
      throw new Error('Bootstrap not initialized');
    }
    return this._config;
  }

  get version(): string {
    return APP_VERSION;
  }

  get external(): ExternalConnection | null {
    return this.config.external;
  }

  async initialize(): Promise<void> {
    const argv = process.argv.slice(2);
    const isSingle =
      process.env.DPOT_MODE === 'single' ||
      argv.includes('single') ||
      argv.includes('--single');

    const dataDir =
      process.env.DPOT_DATA_DIR ||
      (isSingle ? '/data' : join(process.cwd(), '.datapot-runtime'));

    const configPath =
      process.env.DPOT_CONFIG || join(dataDir, 'config.json');

    mkdirSync(dataDir, { recursive: true });

    const stored = this.readStored(configPath);
    const envExternal = this.readExternalFromEnv();

    // Env-based DB takes precedence (all types including sqlite)
    const envType = process.env.DPOT_DB_TYPE as DbConfig['type'] | undefined;
    const envUrl = process.env.DPOT_DB_URL;
    if (
      envType &&
      envUrl &&
      (envType === 'mariadb' || envType === 'mongodb' || envType === 'sqlite')
    ) {
      const db: DbConfig = { type: envType, url: envUrl };
      this._mode = envType === 'sqlite' || isSingle ? 'single' : 'normal';
      this._config = {
        mode: this._mode,
        db,
        external: envExternal ?? stored.external,
        dataDir,
        configPath,
        preferSingleDataDir: isSingle,
        adminPasswordOverride: process.env.DPOT_ADMIN_PASSWORD,
      };
      this._ready = true;
      this.logger.log(`DB via env: ${envType}`);
      return;
    }

    if (stored.db) {
      this._mode =
        stored.db.type === 'sqlite' || isSingle ? 'single' : 'normal';
      this._config = {
        mode: this._mode,
        db: stored.db,
        external: envExternal ?? stored.external,
        dataDir,
        configPath,
        preferSingleDataDir: isSingle,
        adminPasswordOverride: process.env.DPOT_ADMIN_PASSWORD,
      };
      this._ready = true;
      this.logger.log(`Loaded DB config (${stored.db.type}) from ${configPath}`);
      return;
    }

    // single / normal: no auto SQLite — wait for DBMS selection in Setup UI
    this._mode = 'uninitialized';
    this._config = {
      mode: 'uninitialized',
      db: null,
      external: envExternal ?? stored.external,
      dataDir,
      configPath,
      preferSingleDataDir: isSingle,
      adminPasswordOverride: process.env.DPOT_ADMIN_PASSWORD,
    };
    this._ready = false;
    this.logger.warn(
      isSingle
        ? 'Single mode without DBMS — configure MariaDB / MongoDB / SQLite in Setup'
        : 'No DBMS configured — running in uninitialized state',
    );
  }

  saveDbConfig(db: DbConfig): void {
    const {
      configPath,
      dataDir,
      preferSingleDataDir,
      adminPasswordOverride,
      external,
    } = this.config;
    this._mode =
      db.type === 'sqlite' || preferSingleDataDir ? 'single' : 'normal';
    this._config = {
      mode: this._mode,
      db,
      external,
      dataDir,
      configPath,
      preferSingleDataDir,
      adminPasswordOverride,
    };
    this._ready = true;
    this.persist();
  }

  saveExternal(external: ExternalConnection | null): void {
    const {
      configPath,
      dataDir,
      preferSingleDataDir,
      adminPasswordOverride,
      db,
      mode,
    } = this.config;
    this._config = {
      mode,
      db,
      external,
      dataDir,
      configPath,
      preferSingleDataDir,
      adminPasswordOverride,
    };
    this.persist();
  }

  private persist(): void {
    const { configPath, db, external } = this.config;
    mkdirSync(dirname(configPath), { recursive: true });
    const payload: StoredConfigFile = {
      db: db ?? null,
      external: external ?? null,
    };
    writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  private readExternalFromEnv(): ExternalConnection | null {
    const host = process.env.DPOT_EXTERNAL_HOST?.trim();
    if (!host) return null;
    const portRaw = process.env.DPOT_EXTERNAL_PORT?.trim();
    const port = portRaw ? Number(portRaw) : null;
    return {
      host,
      port: port != null && Number.isFinite(port) && port > 0 ? port : null,
    };
  }

  private readStored(path: string): {
    db: DbConfig | null;
    external: ExternalConnection | null;
  } {
    if (!existsSync(path)) return { db: null, external: null };
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredConfigFile;
      const external = this.normalizeExternal(raw.external);
      if (raw.db?.type && raw.db?.url) {
        return { db: { type: raw.db.type, url: raw.db.url }, external };
      }
      // legacy flat { type, url }
      if (raw.type && raw.url) {
        return { db: { type: raw.type, url: raw.url }, external };
      }
      return { db: null, external };
    } catch {
      return { db: null, external: null };
    }
  }

  private normalizeExternal(
    value: ExternalConnection | null | undefined,
  ): ExternalConnection | null {
    if (!value?.host?.trim()) return null;
    const port =
      value.port != null && Number(value.port) > 0 ? Number(value.port) : null;
    return { host: value.host.trim(), port };
  }
}
