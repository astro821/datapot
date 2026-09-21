import { Injectable } from '@nestjs/common';
import { In, MoreThanOrEqual } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { isPotPriority, type PotPriority } from '@datapot/shared';
import { DatabaseService } from '../database/database.service';
import { PotRecordEntity } from '../database/entities/pot-record.entity';
import { PotSequenceService } from './pot-sequence.service';

export interface PotRecord {
  id: string;
  potId: string;
  seq: number;
  payload: Record<string, unknown>;
  priority: PotPriority;
  confirmed: boolean;
  createdAt: Date;
}

export interface PotRecordPageQuery {
  offset: number;
  limit: number;
  q?: string;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
}

export interface PotRecordPage {
  items: PotRecord[];
  total: number;
}

@Injectable()
export class PotRecordStore {
  constructor(
    private readonly db: DatabaseService,
    private readonly sequences: PotSequenceService,
  ) {}

  async findByPot(potId: string, limit = 10_000): Promise<PotRecord[]> {
    if (this.db.storeKind === 'sql') {
      const rows = await this.db.potRecords().find({
        where: { potId },
        order: { seq: 'ASC' },
        take: limit,
      });
      return rows.map((r) => this.fromEntity(r));
    }
    if (this.db.storeKind === 'mongo') {
      const rows = await this.db
        .mongoCollection('pot_records')
        .find({ potId })
        .sort({ seq: 1 })
        .limit(limit)
        .toArray();
      return rows.map((r) => this.normalize(r as unknown as PotRecord));
    }
    return [];
  }

  /** One page of records. Search and sort run in the database, not on a preloaded slice. */
  async findPage(potId: string, query: PotRecordPageQuery): Promise<PotRecordPage> {
    const offset = Math.max(0, Math.floor(query.offset) || 0);
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit) || 20));
    const q = query.q?.trim() ?? '';
    const sort = resolveRecordSort(query.sortField, query.sortDir);

    if (this.db.storeKind === 'sql') {
      const qb = this.db.potRecords().createQueryBuilder('r').where('r.potId = :potId', { potId });
      if (q) {
        const like = `%${escapeLike(q.toLowerCase())}%`;
        const seqCast = this.db.sqlDialect === 'sqlite' ? 'CAST(r.seq AS TEXT)' : 'CAST(r.seq AS CHAR)';
        const createdCast =
          this.db.sqlDialect === 'sqlite' ? 'CAST(r.createdAt AS TEXT)' : 'CAST(r.createdAt AS CHAR)';
        const confirmedCast =
          this.db.sqlDialect === 'sqlite' ? 'CAST(r.confirmed AS TEXT)' : 'CAST(r.confirmed AS CHAR)';
        qb.andWhere(
          `(LOWER(r.id) LIKE :like ESCAPE '\\' OR LOWER(${seqCast}) LIKE :like ESCAPE '\\' OR LOWER(r.payload) LIKE :like ESCAPE '\\' OR LOWER(${createdCast}) LIKE :like ESCAPE '\\' OR LOWER(r.priority) LIKE :like ESCAPE '\\' OR LOWER(${confirmedCast}) LIKE :like ESCAPE '\\')`,
          { like },
        );
      }
      const total = await qb.clone().getCount();
      if (sort.kind === 'seq') {
        qb.orderBy('r.seq', sort.dir);
      } else if (sort.kind === 'createdAt') {
        qb.orderBy('r.createdAt', sort.dir).addOrderBy('r.seq', 'ASC');
      } else if (sort.kind === 'priority') {
        qb.orderBy('r.priority', sort.dir).addOrderBy('r.seq', 'ASC');
      } else if (sort.kind === 'confirmed') {
        qb.orderBy('r.confirmed', sort.dir).addOrderBy('r.seq', 'ASC');
      } else if (sort.kind === 'payload') {
        const expr =
          this.db.sqlDialect === 'sqlite'
            ? `json_extract(r.payload, '$.${sort.field}')`
            : `JSON_UNQUOTE(JSON_EXTRACT(r.payload, '$.${sort.field}'))`;
        qb.addSelect(expr, 'dpot_sort').orderBy('dpot_sort', sort.dir).addOrderBy('r.seq', 'ASC');
      }
      const rows = await qb.skip(offset).take(limit).getMany();
      return { items: rows.map((row) => this.fromEntity(row)), total };
    }

    if (this.db.storeKind === 'mongo') {
      const col = this.db.mongoCollection('pot_records');
      const sortDoc = mongoSort(sort);
      if (!q) {
        const total = await col.countDocuments({ potId });
        const rows = await col.find({ potId }).sort(sortDoc).skip(offset).limit(limit).toArray();
        return {
          items: rows.map((row) => this.normalize(row as unknown as PotRecord)),
          total,
        };
      }
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const [result] = await col
        .aggregate<{ items: PotRecord[]; total: { count: number }[] }>([
          { $match: { potId } },
          {
            $addFields: {
              _search: {
                $concat: [
                  { $ifNull: ['$id', ''] },
                  ' ',
                  { $toString: { $ifNull: ['$seq', ''] } },
                  ' ',
                  { $toString: { $ifNull: ['$createdAt', ''] } },
                  ' ',
                  { $ifNull: ['$priority', ''] },
                  ' ',
                  { $toString: { $ifNull: ['$confirmed', false] } },
                  ' ',
                  {
                    $reduce: {
                      input: { $objectToArray: { $ifNull: ['$payload', {}] } },
                      initialValue: '',
                      in: {
                        $concat: [
                          '$$value',
                          ' ',
                          {
                            $convert: {
                              input: '$$this.v',
                              to: 'string',
                              onError: '',
                              onNull: '',
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
          { $match: { _search: { $regex: escaped, $options: 'i' } } },
          {
            $facet: {
              items: [
                { $sort: sortDoc },
                { $skip: offset },
                { $limit: limit },
                { $project: { _search: 0 } },
              ],
              total: [{ $count: 'count' }],
            },
          },
        ])
        .toArray();
      const items = (result?.items ?? []).map((row) => this.normalize(row));
      return { items, total: result?.total?.[0]?.count ?? 0 };
    }

    return { items: [], total: 0 };
  }

  async insert(
    potId: string,
    payload: Record<string, unknown>,
    opts?: {
      seq?: number;
      createdAt?: Date;
      id?: string;
      priority?: PotPriority;
      confirmed?: boolean;
    },
  ): Promise<PotRecord> {
    const seq = opts?.seq ?? (await this.sequences.nextVal(potId));
    const record: PotRecord = {
      id: opts?.id ?? uuid(),
      potId,
      seq,
      payload,
      priority: opts?.priority && isPotPriority(opts.priority) ? opts.priority : 'none',
      confirmed: opts?.confirmed === true,
      createdAt: opts?.createdAt ?? new Date(),
    };
    if (this.db.storeKind === 'sql') {
      await this.db.potRecords().save(record as PotRecordEntity);
      return record;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('pot_records').insertOne({ ...record });
      return record;
    }
    throw new Error('Database not connected');
  }

  async create(potId: string, payload: Record<string, unknown>): Promise<PotRecord> {
    return this.insert(potId, payload);
  }

  async findById(potId: string, id: string): Promise<PotRecord | null> {
    if (this.db.storeKind === 'sql') {
      const row = await this.db.potRecords().findOne({ where: { id, potId } });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db.mongoCollection('pot_records').findOne({ id, potId });
      return row ? this.normalize(row as unknown as PotRecord) : null;
    }
    return null;
  }

  async updateFlags(
    potId: string,
    id: string,
    patch: { priority?: PotPriority; confirmed?: boolean },
  ): Promise<PotRecord | null> {
    const current = await this.findById(potId, id);
    if (!current) return null;
    const next: PotRecord = {
      ...current,
      priority: patch.priority ?? current.priority,
      confirmed: patch.confirmed ?? current.confirmed,
    };
    if (this.db.storeKind === 'sql') {
      await this.db.potRecords().update(
        { id, potId },
        { priority: next.priority, confirmed: next.confirmed },
      );
      return next;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('pot_records').updateOne(
        { id, potId },
        { $set: { priority: next.priority, confirmed: next.confirmed } },
      );
      return next;
    }
    return null;
  }

  async deleteByPot(potId: string): Promise<void> {
    if (this.db.storeKind === 'sql') {
      await this.db.potRecords().delete({ potId });
      return;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('pot_records').deleteMany({ potId });
    }
  }

  async deleteByIds(potId: string, ids: string[]): Promise<number> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) return 0;
    if (this.db.storeKind === 'sql') {
      const r = await this.db.potRecords().delete({ potId, id: In(unique) });
      return r.affected ?? 0;
    }
    if (this.db.storeKind === 'mongo') {
      const r = await this.db
        .mongoCollection('pot_records')
        .deleteMany({ potId, id: { $in: unique } });
      return r.deletedCount ?? 0;
    }
    return 0;
  }

  async countByPot(potId: string): Promise<number> {
    if (this.db.storeKind === 'sql') {
      return this.db.potRecords().count({ where: { potId } });
    }
    if (this.db.storeKind === 'mongo') {
      return this.db.mongoCollection('pot_records').countDocuments({ potId });
    }
    return 0;
  }

  async countUnverifiedByPot(potId: string): Promise<number> {
    if (this.db.storeKind === 'sql') {
      return this.db.potRecords().count({ where: { potId, confirmed: false } });
    }
    if (this.db.storeKind === 'mongo') {
      return this.db.mongoCollection('pot_records').countDocuments({
        potId,
        confirmed: { $ne: true },
      });
    }
    return 0;
  }

  async findEarliestByPot(potId: string): Promise<PotRecord | null> {
    if (this.db.storeKind === 'sql') {
      const row = await this.db.potRecords().findOne({
        where: { potId },
        order: { createdAt: 'ASC' },
      });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db
        .mongoCollection('pot_records')
        .find({ potId })
        .sort({ createdAt: 1 })
        .limit(1)
        .next();
      return row ? this.normalize(row as unknown as PotRecord) : null;
    }
    return null;
  }

  async findLatestByPot(potId: string): Promise<PotRecord | null> {
    if (this.db.storeKind === 'sql') {
      const row = await this.db.potRecords().findOne({
        where: { potId },
        order: { createdAt: 'DESC' },
      });
      return row ? this.fromEntity(row) : null;
    }
    if (this.db.storeKind === 'mongo') {
      const row = await this.db
        .mongoCollection('pot_records')
        .find({ potId })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();
      return row ? this.normalize(row as unknown as PotRecord) : null;
    }
    return null;
  }

  /**
   * Daily counts of each comma-separated value in a 구분자 field.
   * Dates match `dailyCountsByPot` for the same span.
   */
  async typeTrendByPot(
    potId: string,
    field: string,
    daySpan = 183,
  ): Promise<{ dates: string[]; series: { label: string; counts: number[] }[] }> {
    if (!/^[a-z0-9_]+$/.test(field)) return { dates: [], series: [] };
    const { start, end, dates } = this.rangeDays(daySpan);
    const index = new Map(dates.map((date, i) => [date, i]));
    const buckets = new Map<string, number[]>();

    const add = (at: Date, payload: Record<string, unknown> | null | undefined) => {
      if (at > end) return;
      const slot = index.get(this.dayKey(at));
      if (slot == null) return;
      const raw = payload?.[field];
      if (raw == null || raw === '') return;
      const parts = (Array.isArray(raw) ? raw.map((item) => String(item)) : String(raw).split(','))
        .map((part) => part.trim())
        .filter(Boolean);
      for (const label of parts) {
        let counts = buckets.get(label);
        if (!counts) {
          counts = Array(dates.length).fill(0);
          buckets.set(label, counts);
        }
        counts[slot] += 1;
      }
    };

    if (this.db.storeKind === 'sql') {
      const rows = await this.db.potRecords().find({
        where: { potId, createdAt: MoreThanOrEqual(start) },
        select: ['createdAt', 'payload'],
      });
      for (const row of rows) {
        const at = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
        add(at, row.payload);
      }
    } else if (this.db.storeKind === 'mongo') {
      const rows = await this.db
        .mongoCollection('pot_records')
        .find({ potId, createdAt: { $gte: start, $lte: end } })
        .project({ createdAt: 1, payload: 1 })
        .toArray();
      for (const row of rows) {
        const doc = row as { createdAt: Date; payload?: Record<string, unknown> };
        add(new Date(doc.createdAt), doc.payload);
      }
    }

    const series = [...buckets.entries()]
      .map(([label, counts]) => ({ label, counts }))
      .sort((a, b) => {
        const diff = b.counts.reduce((s, n) => s + n, 0) - a.counts.reduce((s, n) => s + n, 0);
        return diff || a.label.localeCompare(b.label, 'ko');
      });
    return { dates, series };
  }

  /**
   * Daily create counts for [since, now], filled with zeros for missing days.
   * Returns oldest → newest, length = daySpan.
   */
  async dailyCountsByPot(
    potId: string,
    daySpan = 30,
  ): Promise<{ date: string; count: number }[]> {
    const { start, end, dates } = this.rangeDays(daySpan);
    const buckets = new Map(dates.map((date) => [date, 0]));

    if (this.db.storeKind === 'sql') {
      const rows = await this.db.potRecords().find({
        where: { potId, createdAt: MoreThanOrEqual(start) },
        select: ['createdAt'],
      });
      for (const row of rows) {
        const at = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
        if (at > end) continue;
        const key = this.dayKey(at);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
      }
    } else if (this.db.storeKind === 'mongo') {
      const rows = await this.db
        .mongoCollection('pot_records')
        .find({ potId, createdAt: { $gte: start, $lte: end } })
        .project({ createdAt: 1 })
        .toArray();
      for (const row of rows) {
        const at = new Date((row as { createdAt: Date }).createdAt);
        const key = this.dayKey(at);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
      }
    }

    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }

  private rangeDays(daySpan: number): { start: Date; end: Date; dates: string[] } {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (daySpan - 1));
    const dates: string[] = [];
    for (let i = 0; i < daySpan; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(this.dayKey(d));
    }
    return { start, end, dates };
  }

  private dayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private fromEntity(row: PotRecordEntity): PotRecord {
    return this.normalize({
      id: row.id,
      potId: row.potId,
      seq: row.seq,
      payload: row.payload,
      priority: row.priority,
      confirmed: row.confirmed,
      createdAt: row.createdAt,
    });
  }

  private normalize(row: PotRecord): PotRecord {
    return {
      ...row,
      seq: Number(row.seq ?? 0),
      priority: isPotPriority(row.priority) ? row.priority : 'none',
      confirmed: isConfirmedFlag(row.confirmed),
    };
  }
}

type RecordSort =
  | { kind: 'seq' | 'createdAt' | 'priority' | 'confirmed'; dir: 'ASC' | 'DESC' }
  | { kind: 'payload'; field: string; dir: 'ASC' | 'DESC' };

function resolveRecordSort(field: string | undefined, dir: 'asc' | 'desc' | undefined): RecordSort {
  const order = dir === 'desc' ? 'DESC' : 'ASC';
  if (field === 'createdAt' || field === 'priority' || field === 'confirmed') {
    return { kind: field, dir: order };
  }
  if (field && field !== 'seq' && /^[a-z0-9_]+$/.test(field)) {
    return { kind: 'payload', field, dir: order };
  }
  return { kind: 'seq', dir: order };
}

function mongoSort(sort: RecordSort): Record<string, 1 | -1> {
  const dir = sort.dir === 'DESC' ? -1 : 1;
  if (sort.kind === 'createdAt') return { createdAt: dir, seq: 1 };
  if (sort.kind === 'priority') return { priority: dir, seq: 1 };
  if (sort.kind === 'confirmed') return { confirmed: dir, seq: 1 };
  if (sort.kind === 'payload') return { [`payload.${sort.field}`]: dir, seq: 1 };
  return { seq: dir };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function isConfirmedFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}
