import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ArrayMinSize,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  buildPotApiPaths,
  buildPotPublicBase,
  isPotPriority,
  isValidPotKey,
  normalizePotFields,
  normalizePotKey,
  POT_PRIORITIES,
  POT_OAS_PATHS,
  type DatapotBackupFile,
  type DatapotBackupPot,
  type PotField,
} from '@datapot/shared';
import { JwtAuthGuard, AdminGuard } from '../auth/guards';
import { DataPotStore } from './datapot.store';
import { PotRecordStore, type PotRecord } from './pot-record.store';
import { PotRuntimeService } from '../pot-runtime/pot-runtime.service';
import { PotSequenceService } from './pot-sequence.service';
import { BootstrapService } from '../bootstrap/bootstrap.service';

class IssueTokenDto {
  @IsOptional()
  @IsIn([30, 90, 365])
  days?: number;
}

class DeleteRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}

class UpdateRecordFlagsDto {
  @IsOptional()
  @IsIn(POT_PRIORITIES)
  priority?: (typeof POT_PRIORITIES)[number];

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

class PotFieldDto {
  @IsString()
  @MinLength(1)
  slug!: string;

  @IsString()
  @MinLength(1)
  nameEn!: string;

  @IsString()
  nameKo!: string;

  @IsIn(['number', 'text', 'url', 'date', 'boolean', 'type'])
  type!: 'number' | 'text' | 'url' | 'date' | 'boolean' | 'type';

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsBoolean()
  nullable?: boolean;

  @IsOptional()
  @IsBoolean()
  trend?: boolean;
}

class CreatePotDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  key!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1024)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PotFieldDto)
  fields?: PotFieldDto[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class UpdatePotDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PotFieldDto)
  fields?: PotFieldDto[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@Controller('datapots')
@UseGuards(JwtAuthGuard)
export class DatapotsController {
  constructor(
    private readonly store: DataPotStore,
    private readonly records: PotRecordStore,
    private readonly runtime: PotRuntimeService,
    private readonly sequences: PotSequenceService,
    private readonly bootstrap: BootstrapService,
  ) {}

  @Get()
  async list() {
    const rows = await this.store.findAll();
    return rows.map((p) => this.toDto(p));
  }

  @Get('overview')
  async overview(@Query('tzOffsetMinutes') tz?: string) {
    const offset = parseTzOffset(tz);
    const pots = await this.store.findAll();
    const out = [];
    for (const pot of pots) {
      const [recordCount, unverifiedCount, earliest, latest, dailyCounts] = await Promise.all([
        this.records.countByPot(pot.id),
        this.records.countUnverifiedByPot(pot.id),
        this.records.findEarliestByPot(pot.id),
        this.records.findLatestByPot(pot.id),
        this.records.dailyCountsByPot(pot.id, 183, offset),
      ]);
      out.push({
        id: pot.id,
        name: pot.name,
        key: pot.key,
        port: pot.port,
        enabled: pot.enabled,
        recordCount,
        unverifiedCount,
        firstCreatedAt: earliest?.createdAt ? earliest.createdAt.toISOString() : null,
        lastCreatedAt: latest?.createdAt ? latest.createdAt.toISOString() : null,
        dailyCounts,
        typeFields: (pot.fields ?? [])
          .filter((field) => field.type === 'type')
          .map((field) => ({
            slug: field.slug,
            nameKo: field.nameKo,
            nameEn: field.nameEn,
            trend: field.trend === true,
          })),
      });
    }
    return out;
  }

  @Get('backup')
  @UseGuards(AdminGuard)
  async backup(): Promise<DatapotBackupFile> {
    const pots = await this.store.findAll();
    const out: DatapotBackupPot[] = [];
    for (const pot of pots) {
      const rows = await this.records.findByPot(pot.id);
      out.push({
        name: pot.name,
        key: pot.key,
        description: pot.description,
        port: pot.port,
        enabled: pot.enabled,
        fields: pot.fields ?? [],
        records: rows.map((r) => ({
          seq: r.seq,
          payload: r.payload,
          createdAt: r.createdAt.toISOString(),
          priority: r.priority,
          confirmed: r.confirmed,
        })),
      });
    }
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      pots: out,
    };
  }

  @Post('restore')
  @UseGuards(AdminGuard)
  async restore(@Body() body: DatapotBackupFile) {
    if (!body || body.version !== 1 || !Array.isArray(body.pots)) {
      throw new BadRequestException('Invalid backup file (expected version: 1, pots: [])');
    }
    const names = body.pots.map((p) => (p.name || '').trim()).filter(Boolean);
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Backup contains duplicate pot names');
    }
    const keys = body.pots.map((p) => normalizePotKey(p.key || p.name || ''));
    if (keys.some((key) => !isValidPotKey(key))) {
      throw new BadRequestException(
        'key는 소문자로 시작하고, 소문자·숫자·밑줄만 32자 이하로 써야 합니다',
      );
    }
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Backup contains duplicate pot keys');
    }

    const created: string[] = [];
    const updated: string[] = [];

    for (const item of body.pots) {
      const name = (item.name || '').trim();
      if (!name) continue;
      const key = normalizePotKey(item.key || name);
      const fields = Array.isArray(item.fields) ? (item.fields as PotField[]) : [];
      const records = Array.isArray(item.records) ? item.records : [];
      const byKey = await this.store.findByKey(key);
      const byName = await this.store.findByName(name);
      if (byKey && byName && byKey.id !== byName.id) {
        throw new BadRequestException(`DATAPOT key "${key}" is already in use`);
      }
      const existing = byKey || byName;
      if (existing && existing.key !== key) {
        throw new BadRequestException(`복원으로 key를 덮어쓸 수 없습니다 (${existing.key})`);
      }

      let pot;
      if (existing) {
        let port = existing.port;
        if (item.port && item.port !== existing.port) {
          const portOwner = await this.store.findByPort(item.port);
          if (!portOwner || portOwner.id === existing.id) port = item.port;
        }
        pot = await this.store.update(existing.id, {
          name,
          description: item.description,
          port,
          fields,
          enabled: item.enabled ?? existing.enabled,
        });
        if (!pot) throw new BadRequestException(`Failed to update pot: ${name}`);
        updated.push(name);
      } else {
        const port = await this.allocatePort(item.port || 9001);
        pot = await this.store.create({
          name,
          key,
          description: item.description,
          port,
          fields,
          enabled: item.enabled ?? true,
        });
        await this.sequences.createSequence(pot.id);
        created.push(name);
      }

      await this.records.deleteByPot(pot.id);
      let maxSeq = 0;
      let fallback = 0;
      for (const row of records) {
        let seq = Number(row.seq);
        if (!Number.isFinite(seq) || seq <= 0) {
          fallback += 1;
          seq = Math.max(fallback, maxSeq + 1);
        }
        maxSeq = Math.max(maxSeq, seq);
        await this.records.insert(pot.id, (row.payload as Record<string, unknown>) || {}, {
          seq,
          createdAt: row.createdAt ? new Date(String(row.createdAt)) : undefined,
          priority: isPotPriority(row.priority) ? row.priority : 'none',
          confirmed: row.confirmed === true,
        });
      }
      if (maxSeq > 0) {
        await this.sequences.setValue(pot.id, maxSeq);
      }
      await this.records.syncIndexes(pot.key, pot.fields ?? []);

      await this.runtime.restartPot(pot);
    }

    return {
      ok: true,
      created: created.length,
      updated: updated.length,
      createdNames: created,
      updatedNames: updated,
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    return this.toDto(pot);
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() body: CreatePotDto) {
    const name = body.name.trim();
    const key = normalizePotKey(body.key);
    if (!isValidPotKey(key)) {
      throw new BadRequestException(
        'key는 소문자로 시작하고, 소문자·숫자·밑줄만 32자 이하로 써야 합니다',
      );
    }
    const byName = await this.store.findByName(name);
    if (byName) {
      throw new BadRequestException(`DATAPOT name "${name}" is already in use`);
    }
    const byKey = await this.store.findByKey(key);
    if (byKey) {
      throw new BadRequestException(`DATAPOT key "${key}" is already in use`);
    }
    const existing = await this.store.findByPort(body.port);
    if (existing) {
      throw new BadRequestException(`Port ${body.port} is already in use`);
    }
    const pot = await this.store.create({
      name,
      key,
      description: body.description,
      port: body.port,
      fields: normalizePotFields((body.fields as PotField[]) ?? []),
      enabled: body.enabled,
    });
    await this.sequences.createSequence(pot.id);
    await this.records.syncIndexes(pot.key, pot.fields ?? []);
    if (pot.enabled) {
      await this.runtime.startPot(pot);
    }
    return this.toDto(pot);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() body: UpdatePotDto) {
    const existing = await this.store.findById(id);
    if (!existing) throw new NotFoundException('DataPot not found');

    if (body.name != null) {
      const byName = await this.store.findByName(body.name);
      if (byName && byName.id !== id) {
        throw new BadRequestException(`DATAPOT name "${body.name.trim()}" is already in use`);
      }
    }
    if (body.key != null && normalizePotKey(body.key) !== existing.key) {
      throw new BadRequestException('key는 생성 후에 바꿀 수 없습니다');
    }
    if (body.port != null) {
      const conflict = await this.store.findByPort(body.port);
      if (conflict && conflict.id !== id) {
        throw new BadRequestException(`Port ${body.port} is already in use`);
      }
    }
    if (body.fields) {
      const slugs = body.fields.map((f) => f.slug);
      if (new Set(slugs).size !== slugs.length) {
        throw new BadRequestException('Duplicate field slug');
      }
    }

    const portChanged = body.port != null && body.port !== existing.port;

    const patch: Partial<{
      name: string;
      description: string;
      port: number;
      fields: PotField[];
      enabled: boolean;
    }> = {};
    if (body.name != null) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.port != null) patch.port = body.port;
    if (body.fields !== undefined) patch.fields = normalizePotFields(body.fields as PotField[]);

    if (portChanged) {
      patch.enabled = false;
    } else if (body.enabled != null) {
      patch.enabled = body.enabled;
    }

    const pot = await this.store.update(id, patch);
    if (!pot) throw new NotFoundException('DataPot not found');
    if (body.fields !== undefined) {
      await this.records.syncIndexes(pot.key, pot.fields ?? []);
    }

    const runtimeAffecting =
      portChanged || body.fields !== undefined || body.enabled != null;
    if (runtimeAffecting) {
      await this.runtime.restartPot(pot);
    }
    return this.toDto(pot);
  }

  @Post(':id/restart')
  @UseGuards(AdminGuard)
  async restart(@Param('id') id: string) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    await this.runtime.restartPot(pot);
    return this.toDto(pot);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    await this.runtime.stopPot(id);
    await this.records.deleteByPot(id);
    await this.sequences.dropSequence(id);
    await this.store.delete(id);
    return { ok: true };
  }

  @Post(':id/token')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async issueToken(@Param('id') id: string, @Body() body: IssueTokenDto) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    const days = body.days ?? 30;
    if (days !== 30 && days !== 90 && days !== 365) {
      throw new BadRequestException('만료일은 30, 90, 365일 중 하나여야 합니다');
    }
    const token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const updated = await this.store.setApiToken(id, hash, expiresAt);
    if (!updated) throw new NotFoundException('DataPot not found');
    return { token, expiresAt: expiresAt.toISOString(), days };
  }

  @Get(':id/trend')
  async trend(
    @Param('id') id: string,
    @Query('field') field?: string,
    @Query('tzOffsetMinutes') tz?: string,
  ) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    const slug = field?.trim() ?? '';
    const typeField = (pot.fields ?? []).find((item) => item.slug === slug && item.type === 'type');
    if (!typeField) throw new BadRequestException('Select a type field');
    const trend = await this.records.typeTrendByPot(id, typeField.slug, 183, parseTzOffset(tz));
    return { field: typeField.slug, ...trend };
  }

  @Get(':id/records/ids')
  async listRecordIds(@Param('id') id: string, @Query('q') q?: string) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    const ids = await this.records.findIds(id, q);
    return { ids };
  }

  @Get(':id/records')
  async listRecords(
    @Param('id') id: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
  ) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    const page = await this.records.findPage(id, {
      offset: parsePageInt(offset, 0),
      limit: parsePageInt(limit, 20),
      q,
      sortField: sort,
      sortDir: dir === 'desc' ? 'desc' : 'asc',
    });
    return {
      total: page.total,
      items: page.items.map((r) => this.toRecordDto(r)),
    };
  }

  @Patch(':id/records/:recordId')
  @UseGuards(AdminGuard)
  async updateRecordFlags(
    @Param('id') id: string,
    @Param('recordId') recordId: string,
    @Body() body: UpdateRecordFlagsDto,
  ) {
    if (body.priority === undefined && body.confirmed === undefined) {
      throw new BadRequestException('priority or confirmed is required');
    }
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    const row = await this.records.updateFlags(id, recordId, body);
    if (!row) throw new NotFoundException('Record not found');
    return this.toRecordDto(row);
  }

  @Post(':id/records/delete')
  @UseGuards(AdminGuard)
  async deleteRecords(@Param('id') id: string, @Body() body: DeleteRecordsDto) {
    const pot = await this.store.findById(id);
    if (!pot) throw new NotFoundException('DataPot not found');
    const deleted = await this.records.deleteByIds(id, body.ids);
    return { ok: true, deleted };
  }

  private toRecordDto(r: PotRecord) {
    return {
      id: r.id,
      potId: r.potId,
      seq: r.seq,
      payload: r.payload,
      priority: r.priority,
      confirmed: r.confirmed,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async allocatePort(preferred: number): Promise<number> {
    let port = preferred >= 1024 && preferred <= 65535 ? preferred : 9001;
    for (let i = 0; i < 2000; i++) {
      const taken = await this.store.findByPort(port);
      if (!taken) return port;
      port += 1;
      if (port > 65535) port = 1024;
    }
    throw new BadRequestException('No free port available');
  }

  private toDto(p: {
    id: string;
    name: string;
    key: string;
    description?: string;
    port: number;
    fields: PotField[];
    schema: Record<string, unknown>;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    apiTokenExpiresAt?: Date | null;
  }) {
    const base = buildPotPublicBase({
      potPort: p.port,
      external: this.bootstrap.config.external,
      fallbackHost: '<host>',
      fallbackScheme: 'http',
    });
    const apiPaths = buildPotApiPaths(p.key);
    return {
      id: p.id,
      name: p.name,
      key: p.key,
      description: p.description,
      port: p.port,
      fields: p.fields ?? [],
      schema: p.schema,
      enabled: p.enabled,
      endpoints: {
        create: `${base}${apiPaths.create}`,
        list: `${base}${apiPaths.list}`,
        get: `${base}${apiPaths.get}`,
        openapi: `${base}${POT_OAS_PATHS.openapi}`,
        docs: `${base}${POT_OAS_PATHS.docs}`,
      },
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      apiTokenExpiresAt: p.apiTokenExpiresAt ? new Date(p.apiTokenExpiresAt).toISOString() : null,
    };
  }
}

function parseTzOffset(raw: string | undefined): number {
  if (raw == null || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-14 * 60, Math.min(14 * 60, Math.trunc(n)));
}

function parsePageInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}
