import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** Per-pot counter in `pot_sequences`. */
@Injectable()
export class PotSequenceService {
  private readonly logger = new Logger(PotSequenceService.name);

  constructor(private readonly db: DatabaseService) {}

  async createSequence(potId: string): Promise<void> {
    await this.db.mongoCollection('pot_sequences').updateOne(
      { potId },
      { $setOnInsert: { potId, value: 0 } },
      { upsert: true },
    );
  }

  async dropSequence(potId: string): Promise<void> {
    try {
      await this.db.mongoCollection('pot_sequences').deleteOne({ potId });
    } catch (e) {
      this.logger.warn(
        `Failed to drop sequence for pot ${potId}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  /** Set sequence so the next nextVal() returns value+1. */
  async setValue(potId: string, value: number): Promise<void> {
    const v = Math.max(0, Math.floor(value));
    await this.db.mongoCollection('pot_sequences').updateOne(
      { potId },
      { $set: { potId, value: v } },
      { upsert: true },
    );
  }

  async nextVal(potId: string): Promise<number> {
    const col = this.db.mongoCollection<{ potId: string; value: number }>('pot_sequences');
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
}
