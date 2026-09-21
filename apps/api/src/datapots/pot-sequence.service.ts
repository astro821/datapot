import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** Safe SQL identifier for per-pot sequences / seq tables */
export function potSequenceName(potId: string): string {
  const id = potId.replace(/[^a-zA-Z0-9]/g, '_');
  return `pot_seq_${id}`;
}

/**
 * Per-DataPot sequence: create on pot add, next on insert, drop on pot delete.
 * - MariaDB: native SEQUENCE
 * - SQLite: AUTOINCREMENT helper table
 * - MongoDB: counter document in pot_sequences
 */
@Injectable()
export class PotSequenceService {
  private readonly logger = new Logger(PotSequenceService.name);

  constructor(private readonly db: DatabaseService) {}

  async createSequence(potId: string): Promise<void> {
    if (this.db.storeKind === 'sql') {
      const name = potSequenceName(potId);
      const type = this.db.sqlDialect;
      if (type === 'mariadb') {
        try {
          await this.db.query(
            `CREATE SEQUENCE \`${name}\` START WITH 1 INCREMENT BY 1 MINVALUE 1 NOCYCLE`,
          );
        } catch {
          /* already exists */
        }
      } else if (type === 'sqlite') {
        await this.db.query(
          `CREATE TABLE IF NOT EXISTS "${name}" (n INTEGER PRIMARY KEY AUTOINCREMENT)`,
        );
      }
      return;
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('pot_sequences').updateOne(
        { potId },
        { $setOnInsert: { potId, value: 0 } },
        { upsert: true },
      );
    }
  }

  async dropSequence(potId: string): Promise<void> {
    try {
      if (this.db.storeKind === 'sql') {
        const name = potSequenceName(potId);
        const type = this.db.sqlDialect;
        if (type === 'mariadb') {
          try {
            await this.db.query(`DROP SEQUENCE \`${name}\``);
          } catch {
            /* missing */
          }
        } else if (type === 'sqlite') {
          await this.db.query(`DROP TABLE IF EXISTS "${name}"`);
        }
        return;
      }
      if (this.db.storeKind === 'mongo') {
        await this.db.mongoCollection('pot_sequences').deleteOne({ potId });
      }
    } catch (e) {
      this.logger.warn(
        `Failed to drop sequence for pot ${potId}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Set sequence so next nextVal() returns value+1 */
  async setValue(potId: string, value: number): Promise<void> {
    const v = Math.max(0, Math.floor(value));
    await this.createSequence(potId);
    if (this.db.storeKind === 'sql') {
      const name = potSequenceName(potId);
      const type = this.db.sqlDialect;
      if (type === 'mariadb') {
        try {
          await this.db.query(`DROP SEQUENCE \`${name}\``);
        } catch {
          /* missing */
        }
        await this.db.query(
          `CREATE SEQUENCE \`${name}\` START WITH ${v + 1} INCREMENT BY 1 MINVALUE 1 NOCYCLE`,
        );
        return;
      }
      if (type === 'sqlite') {
        await this.db.query(`DELETE FROM "${name}"`);
        if (v > 0) {
          await this.db.query(
            `INSERT INTO "${name}" (n) VALUES (${v})`,
          );
        }
        return;
      }
    }
    if (this.db.storeKind === 'mongo') {
      await this.db.mongoCollection('pot_sequences').updateOne(
        { potId },
        { $set: { potId, value: v } },
        { upsert: true },
      );
    }
  }

  /** Allocate next sequence value (+1). Lazily creates sequence if missing. */
  async nextVal(potId: string): Promise<number> {
    if (this.db.storeKind === 'sql') {
      const name = potSequenceName(potId);
      const type = this.db.sqlDialect;
      if (type === 'mariadb') {
        try {
          const rows = (await this.db.query(
            `SELECT NEXT VALUE FOR \`${name}\` AS v`,
          )) as Array<{ v: number | string }>;
          return Number(rows[0]?.v);
        } catch {
          await this.createSequence(potId);
          const rows = (await this.db.query(
            `SELECT NEXT VALUE FOR \`${name}\` AS v`,
          )) as Array<{ v: number | string }>;
          return Number(rows[0]?.v);
        }
      }
      if (type === 'sqlite') {
        try {
          await this.db.query(`INSERT INTO "${name}" DEFAULT VALUES`);
        } catch {
          await this.createSequence(potId);
          await this.db.query(`INSERT INTO "${name}" DEFAULT VALUES`);
        }
        const rows = (await this.db.query(
          `SELECT last_insert_rowid() AS v`,
        )) as Array<{ v: number }>;
        return Number(rows[0]?.v);
      }
    }
    if (this.db.storeKind === 'mongo') {
      const col = this.db.mongoCollection<{ potId: string; value: number }>(
        'pot_sequences',
      );
      let doc = await col.findOneAndUpdate(
        { potId },
        { $inc: { value: 1 } },
        { returnDocument: 'after' },
      );
      if (!doc) {
        await this.createSequence(potId);
        doc = await col.findOneAndUpdate(
          { potId },
          { $inc: { value: 1 } },
          { returnDocument: 'after' },
        );
      }
      if (!doc) throw new Error(`Sequence missing for pot ${potId}`);
      return Number(doc.value);
    }
    throw new Error('Database not connected');
  }
}
