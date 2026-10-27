import type { InMemoryStore, InMemoryTable } from '../../../shared/persistence/in-memory/in-memory-store';
import type { HoldRepository } from '../application/ports';
import type { Hold } from '../domain/hold';
import { fromHoldRecord, type HoldRecord, toHoldRecord } from './hold-record.mapper';

export class InMemoryHoldRepository implements HoldRepository {
  private readonly table: InMemoryTable<HoldRecord>;

  constructor(store: InMemoryStore) {
    this.table = store.table<HoldRecord>('holds');
  }

  insert(hold: Hold): Promise<void> {
    this.table.insert(hold.id, toHoldRecord(hold));
    return Promise.resolve();
  }

  findById(id: string): Promise<Hold | null> {
    const row = this.table.get(id);
    return Promise.resolve(row ? fromHoldRecord(row) : null);
  }

  save(hold: Hold): Promise<void> {
    this.table.update(hold.id, toHoldRecord(hold), hold.version);
    return Promise.resolve();
  }

  findExpiredActiveIds(now: Date, limit: number): Promise<string[]> {
    return Promise.resolve(
      this.table
        .all()
        .filter((row) => row.status === 'active' && row.expiresAt <= now)
        .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
        .slice(0, limit)
        .map((row) => row.id),
    );
  }
}

