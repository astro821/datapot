import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  APP_VERSION,
  DbConfig,
  DbType,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  ExternalConnection,
  isValidExternalHost,
  isValidPortNumber,
  SystemStatus,
} from '@datapot/shared';
import { BootstrapService } from '../bootstrap/bootstrap.service';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';
import { AdminGuard, JwtAuthGuard } from '../auth/guards';
import { PotRuntimeService } from '../pot-runtime/pot-runtime.service';
import { DataPotStore } from '../datapots/datapot.store';
import { UserStore } from '../users/user.store';

class DbBodyDto {
  @IsIn(['mariadb', 'mongodb', 'sqlite'])
  dbType!: DbType;

  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsString()
  adminPassword?: string;
}

class AdminPasswordDto {
  @IsString()
  @MinLength(4)
  password!: string;
}

class ExternalBodyDto {
  @IsString()
  @MinLength(1)
  host!: string;

  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number | null;
}

@Controller('system')
export class SystemController {
  constructor(
    private readonly bootstrap: BootstrapService,
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
    private readonly potRuntime: PotRuntimeService,
    private readonly datapots: DataPotStore,
    private readonly users: UserStore,
  ) {}

  @Get('status')
  async status(): Promise<SystemStatus & { potCount?: number; userCount?: number }> {
    const initialized = this.bootstrap.ready && this.db.isConnected;
    const ext = this.bootstrap.config.external;
    const base: SystemStatus & { potCount?: number; userCount?: number } = {
      initialized,
      mode: this.bootstrap.mode,
      dbType: this.bootstrap.config.db?.type ?? null,
      version: APP_VERSION,
      externalHost: ext?.host ?? null,
      externalPort: ext?.port ?? null,
    };
    if (initialized) {
      base.potCount = await this.datapots.count();
      base.userCount = await this.users.count();
    }
    return base;
  }

  @Get('external')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getExternal() {
    const ext = this.bootstrap.config.external;
    return {
      configured: Boolean(ext?.host),
      host: ext?.host ?? '',
      port: ext?.port ?? null,
    };
  }

  @Post('external')
  @UseGuards(JwtAuthGuard, AdminGuard)
  saveExternal(@Body() body: ExternalBodyDto) {
    const host = body.host.trim();
    if (!host) {
      throw new BadRequestException('공인 IP 또는 도메인을 입력하세요');
    }
    if (!isValidExternalHost(host)) {
      throw new BadRequestException(
        '호스트는 IPv4(예: 203.0.113.10) 또는 도메인(예: api.example.com) 형식이어야 합니다',
      );
    }
    const port =
      body.port != null && Number(body.port) > 0 ? Number(body.port) : null;
    if (port == null || !isValidPortNumber(port)) {
      throw new BadRequestException('포트는 1–65535 정수여야 합니다');
    }
    const external: ExternalConnection = { host, port };
    this.bootstrap.saveExternal(external);
    return {
      configured: true,
      host: external.host,
      port: external.port,
      message: '외부 연결정보가 저장되었습니다',
    };
  }

  @Post('external/clear')
  @UseGuards(JwtAuthGuard, AdminGuard)
  clearExternal() {
    this.bootstrap.saveExternal(null);
    return {
      configured: false,
      host: '',
      port: null,
      message: '외부 연결정보를 삭제했습니다',
    };
  }

  /** Probe connection without persisting (optional pre-check) */
  @Post('db/check')
  async checkDb(@Body() body: DbBodyDto) {
    const cfg: DbConfig = { type: body.dbType, url: body.url.trim() };
    try {
      await this.db.connect(cfg);
      return {
        ok: true,
        connected: true,
        type: cfg.type,
        message: '연결 성공',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        connected: false,
        type: cfg.type,
        message: msg,
      };
    }
  }

  @Post('setup')
  async setup(@Body() body: DbBodyDto) {
    if (this.bootstrap.ready && this.db.isConnected) {
      throw new BadRequestException('System is already initialized');
    }
    const db: DbConfig = { type: body.dbType, url: body.url.trim() };
    try {
      await this.db.connect(db);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`Failed to connect to database: ${msg}`);
    }
    if (body.adminPassword) {
      this.bootstrap.config.adminPasswordOverride = body.adminPassword;
    }
    this.bootstrap.saveDbConfig(db);
    await this.auth.ensureSeedAdmin();
    await this.potRuntime.reloadAll();
    return {
      ...(await this.status()),
      connected: true,
      defaultAdminPassword: body.adminPassword ? undefined : DEFAULT_ADMIN_PASSWORD,
      adminUsername: DEFAULT_ADMIN_USERNAME,
      passwordHint:
        'DBMS 연결에 성공했습니다. admin 비밀번호를 확인하거나 재설정하세요.',
    };
  }

  /** First-time / post-setup admin password set (before login) */
  @Post('setup/admin-password')
  async setupAdminPassword(@Body() body: AdminPasswordDto) {
    if (!this.bootstrap.ready || !this.db.isConnected) {
      throw new BadRequestException('Database is not connected');
    }
    await this.auth.ensureSeedAdmin();
    await this.auth.resetPassword(DEFAULT_ADMIN_USERNAME, body.password);
    return {
      ok: true,
      message: 'admin 비밀번호가 설정되었습니다. 로그인하세요.',
    };
  }

  @Get('db')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getDbConfig() {
    const db = this.bootstrap.config.db;
    if (!db) {
      return { configured: false, connected: this.db.isConnected };
    }
    return {
      configured: true,
      connected: this.db.isConnected,
      type: db.type,
      url: this.maskUrl(db.url),
    };
  }

  @Post('db')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateDb(@Body() body: DbBodyDto) {
    const db: DbConfig = { type: body.dbType, url: body.url.trim() };
    try {
      await this.db.connect(db);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`Failed to connect: ${msg}`);
    }
    this.bootstrap.saveDbConfig(db);

    const userCount = await this.users.count();
    const potCount = await this.datapots.count();
    const emptyDatabase = userCount === 0 && potCount === 0;

    let message: string;
    if (emptyDatabase) {
      this.bootstrap.config.adminPasswordOverride = DEFAULT_ADMIN_PASSWORD;
      await this.auth.ensureSeedAdmin();
      message = `빈 데이터베이스입니다. admin(${DEFAULT_ADMIN_USERNAME}) 비밀번호를 "${DEFAULT_ADMIN_PASSWORD}"(으)로 초기화했습니다.`;
    } else {
      await this.auth.ensureSeedAdmin();
      message =
        '이미 스키마가 있는 데이터베이스입니다. 기존 데이터를 그대로 사용합니다.';
    }

    await this.potRuntime.reloadAll();
    return {
      ...this.getDbConfig(),
      connected: true,
      emptyDatabase,
      message,
      adminUsername: DEFAULT_ADMIN_USERNAME,
      defaultAdminPassword: emptyDatabase ? DEFAULT_ADMIN_PASSWORD : undefined,
      passwordHint: emptyDatabase
        ? message
        : '기존 admin 계정으로 로그인할 수 있습니다.',
    };
  }

  @Post('admin-password')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async resetAdminPassword(@Body() body: AdminPasswordDto) {
    await this.auth.resetPassword(DEFAULT_ADMIN_USERNAME, body.password);
    return { ok: true, message: 'admin 비밀번호가 변경되었습니다' };
  }

  private maskUrl(url: string): string {
    try {
      if (url.startsWith('/') || url.endsWith('.sqlite') || url.endsWith('.db')) {
        return url;
      }
      const u = new URL(url);
      if (u.password) u.password = '****';
      return u.toString();
    } catch {
      return url;
    }
  }
}
