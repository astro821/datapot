import { Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { isPotPriority, type PotField, type PotPriority } from '@datapot/shared';
import { DatabaseService } from '../database/database.service';
import { PotSequenceService } from './pot-sequence.service';
import type { Collection } from 'mongodb';

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
  private readonly keys = new Map<string, string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly sequences: PotSequenceService,
  ) {}

  async findByPot(potId: string, limit = 10_000): Promise<PotRecord[]> {
    const col = await this.collection(potId);
    const rows = await col.find({ potId }).sort({ seq: 1 }).limit(limit).toArray();
    return rows.map((row) => this.normalize(row as unknown as PotRecord));
  }

  async findPage(potId: string, query: PotRecordPageQuery): Promise<PotRecordPage> {
    const offset = Math.max(0, Math.floor(query.offset) || 0);
    const limit = Math.min(100, Math.max(1, Math.floor(query.limit) || 20));
    const q = query.q?.trim() ?? '';
    const sort = resolveRecordSort(query.sortField, query.sortDir);
    const col = await this.collection(potId);
    const sortDoc = mongoSort(sort);
    if (!q) {
      const total = await col.countDocuments({ potId });
      const rows = await col.find({ potId }).sort(sortDoc).skip(offset).limit(limit).toArray();
      return {
        items: rows.map((row) => this.normalize(row as unknown as PotRecord)),
        total,
      };
    }
    const [result] = await col
      .aggregate<{ items: PotRecord[]; total: { count: number }[] }>([
        { $match: { potId } },
        { $addFields: { _search: searchText() } },
        { $match: { _search: { $regex: escapeRegex(q), $options: 'i' } } },
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

  async findIds(potId: string, q?: string): Promise<string[]> {
    const query = q?.trim() ?? '';
    const col = await this.collection(potId);
    if (!query) {
      const rows = await col.find({ potId }).project({ id: 1 }).sort({ seq: 1 }).toArray();
      return rows.map((row) => String((row as { id?: string }).id ?? ''));
    }
    const rows = await col
      .aggregate<{ id: string }>([
        { $match: { potId } },
        { $addFields: { _search: searchText() } },
        { $match: { _search: { $regex: escapeRegex(query), $options: 'i' } } },
        { $sort: { seq: 1 } },
        { $project: { _id: 0, id: 1 } },
      ])
      .toArray();
    return rows.map((row) => row.id);
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
    const col = await this.collection(potId);
    await col.insertOne({ ...record });
    return record;
  }

  async create(potId: string, payload: Record<string, unknown>): Promise<PotRecord> {
    return this.insert(potId, payload);
  }

  async findById(potId: string, id: string): Promise<PotRecord | null> {
    const col = await this.collection(potId);
    const row = await col.findOne({ id, potId });
    return row ? this.normalize(row as unknown as PotRecord) : null;
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
    const col = await this.collection(potId);
    await col.updateOne(
      { id, potId },
      { $set: { priority: next.priority, confirmed: next.confirmed } },
    );
    return next;
  }

  async deleteByPot(potId: string): Promise<void> {
    const key = await this.keyFor(potId);
    this.keys.delete(potId);
    await this.db.dropRecordCollection(key);
  }

  async deleteByIds(potId: string, ids: string[]): Promise<number> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) return 0;
    const col = await this.collection(potId);
    const result = await col.deleteMany({ potId, id: { $in: unique } });
    return result.deletedCount ?? 0;
  }

  async countByPot(potId: string): Promise<number> {
    const col = await this.collection(potId);
    return col.countDocuments({ potId });
  }

  async countUnverifiedByPot(potId: string): Promise<number> {
    const col = await this.collection(potId);
    return col.countDocuments({ potId, confirmed: { $ne: true } });
  }

  async findEarliestByPot(potId: string): Promise<PotRecord | null> {
    const col = await this.collection(potId);
    const row = await col.find({ potId }).sort({ createdAt: 1 }).limit(1).next();
    return row ? this.normalize(row as unknown as PotRecord) : null;
  }

  async findLatestByPot(potId: string): Promise<PotRecord | null> {
    const col = await this.collection(potId);
    const row = await col.find({ potId }).sort({ createdAt: -1 }).limit(1).next();
    return row ? this.normalize(row as unknown as PotRecord) : null;
  }

  async syncIndexes(key: string, fields: PotField[]): Promise<void> {
    await this.db.ensureRecordIndexes(key, fields);
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

    const col = await this.collection(potId);
    const rows = await col
      .find({ potId, createdAt: { $gte: start, $lte: end } })
      .project({ createdAt: 1, payload: 1 })
      .toArray();
    for (const row of rows) {
      const doc = row as { createdAt: Date; payload?: Record<string, unknown> };
      add(new Date(doc.createdAt), doc.payload);
    }

    const series = [...buckets.entries()]
      .map(([label, counts]) => ({ label, counts }))
      .sort((a, b) => {
        const diff = b.counts.reduce((s, n) => s + n, 0) - a.counts.reduce((s, n) => s + n, 0);
        return diff || a.label.localeCompare(b.label, 'ko');
      });
    return { dates, series };
  }

  async dailyCountsByPot(
    potId: string,
    daySpan = 30,
  ): Promise<{ date: string; count: number }[]> {
    const { start, end, dates } = this.rangeDays(daySpan);
    const buckets = new Map(dates.map((date) => [date, 0]));
    const col = await this.collection(potId);
    const rows = await col
      .find({ potId, createdAt: { $gte: start, $lte: end } })
      .project({ createdAt: 1 })
      .toArray();
    for (const row of rows) {
      const at = new Date((row as { createdAt: Date }).createdAt);
      const key = this.dayKey(at);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }

  private async collection(potId: string): Promise<Collection> {
    const key = await this.keyFor(potId);
    return this.db.records(key);
  }

  private async keyFor(potId: string): Promise<string> {
    const cached = this.keys.get(potId);
    if (cached) return cached;
    const pot = await this.db.mongoCollection<{ id: string; key?: string }>('datapots').findOne({
      id: potId,
    });
    const key = pot?.key?.trim() ?? '';
    if (!key) throw new Error(`Pot not found: ${potId}`);
    this.keys.set(potId, key);
    return key;
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

  private normalize(row: PotRecord): PotRecord {
    return {
      ...row,
      seq: Number(row.seq ?? 0),
      priority: isPotPriority(row.priority) ? row.priority : 'none',
      confirmed: row.confirmed === true,
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
  if (sort.kind === 'payload') return { [`payload.${sort.field}`]: dir, seq: 1 };
  return { [sort.kind]: dir, ...(sort.kind === 'seq' ? {} : { seq: 1 }) };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function searchText() {
  return {
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
  };
}
