import { AsyncLocalStorage } from 'node:async_hooks';
import { ConcurrencyConflictError } from '../../application/errors';
import type { TransactionManager } from '../../application/transaction-manager';

export interface VersionedRow {
  readonly version: number;
}

interface StagedWrite {
  readonly table: InMemoryTable<VersionedRow>;
  readonly id: string;
  readonly row: VersionedRow;
  /** null marks an insert. */
  readonly expectedVersion: number | null;
}

type WriteSet = Map<string, StagedWrite>;

/**
 * Process-local store with the same optimistic semantics as the SQL adapter: reads see
 * committed data plus the transaction's own writes, and commit validates every row version
 * and unique key atomically. Commit is synchronous, so no other request can interleave.
 */
export class InMemoryStore implements TransactionManager {
  private readonly context = new AsyncLocalStorage<WriteSet>();
  private readonly tables = new Map<string, InMemoryTable<VersionedRow>>();

  table<TRow extends VersionedRow>(
    name: string,
    uniqueKeys: ReadonlyArray<(row: TRow) => string> = [],
  ): InMemoryTable<TRow> {
    const existing = this.tables.get(name);
    if (existing) {
      return existing as unknown as InMemoryTable<TRow>;
    }
    const table = new InMemoryTable<TRow>(name, uniqueKeys, this);
    this.tables.set(name, table as unknown as InMemoryTable<VersionedRow>);
    return table;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) {
      return work();
    }
    const writes: WriteSet = new Map();
    const result = await this.context.run(writes, work);
    this.commit(writes);
    return result;
  }

  /** @internal */
  stage(write: StagedWrite): void {
    const writes = this.context.getStore();
    if (writes) {
      const key = stageKey(write.table.name, write.id);
      const earlier = writes.get(key);
      // A second write to the same row in one transaction still has to be validated
      // against the version that was committed when the transaction first touched it.
      writes.set(
        key,
        earlier
          ? {
              ...write,
              expectedVersion: earlier.expectedVersion,
              row: { ...write.row, version: earlier.row.version },
            }
          : write,
      );
      return;
    }
    this.commit(new Map([[stageKey(write.table.name, write.id), write]]));
  }

  /** @internal */
  staged(table: string, id: string): VersionedRow | undefined {
    return this.context.getStore()?.get(stageKey(table, id))?.row;
  }

  /** @internal */
  stagedRows(table: string): Array<[string, VersionedRow]> {
    const writes = this.context.getStore();
    if (!writes) {
      return [];
    }
    return [...writes.values()]
      .filter((write) => write.table.name === table)
      .map((write) => [write.id, write.row]);
  }

  reset(): void {
    for (const table of this.tables.values()) {
      table.clear();
    }
  }

  private commit(writes: WriteSet): void {
    for (const write of writes.values()) {
      write.table.validate(write, writes);
    }
    for (const write of writes.values()) {
      write.table.apply(write);
    }
  }
}

export class InMemoryTable<TRow extends VersionedRow> {
  private readonly rows = new Map<string, TRow>();

  constructor(
    readonly name: string,
    private readonly uniqueKeys: ReadonlyArray<(row: TRow) => string>,
    private readonly store: InMemoryStore,
  ) {}

  get(id: string): TRow | undefined {
    const row = (this.store.staged(this.name, id) as TRow | undefined) ?? this.rows.get(id);
    return row ? structuredClone(row) : undefined;
  }

  all(): TRow[] {
    const merged = new Map(this.rows);
    for (const [id, row] of this.store.stagedRows(this.name)) {
      merged.set(id, row as TRow);
    }
    return [...merged.values()].map((row) => structuredClone(row));
  }

  insert(id: string, row: Omit<TRow, 'version'>): void {
    this.stage(id, row, null);
  }

  update(id: string, row: Omit<TRow, 'version'>, expectedVersion: number): void {
    this.stage(id, row, expectedVersion);
  }

  /** @internal */
  validate(write: StagedWrite, batch: ReadonlyMap<string, StagedWrite>): void {
    const committed = this.rows.get(write.id);
    const versionMatches =
      write.expectedVersion === null ? committed === undefined : committed?.version === write.expectedVersion;
    if (!versionMatches) {
      throw new ConcurrencyConflictError(this.name, write.id);
    }
    const row = write.row as TRow;
    for (const uniqueKey of this.uniqueKeys) {
      const value = uniqueKey(row);
      const clashesWithCommitted = [...this.rows.entries()].some(
        ([id, other]) => id !== write.id && uniqueKey(other) === value,
      );
      const clashesWithBatch = [...batch.values()].some(
        (other) =>
          other !== write && other.table === write.table && uniqueKey(other.row as TRow) === value,
      );
      if (clashesWithCommitted || clashesWithBatch) {
        throw new ConcurrencyConflictError(this.name, value);
      }
    }
  }

  /** @internal */
  apply(write: StagedWrite): void {
    this.rows.set(write.id, structuredClone(write.row as TRow));
  }

  clear(): void {
    this.rows.clear();
  }

  private stage(id: string, row: Omit<TRow, 'version'>, expectedVersion: number | null): void {
    const version = (expectedVersion ?? 0) + 1;
    this.store.stage({
      table: this as unknown as InMemoryTable<VersionedRow>,
      id,
      row: structuredClone({ ...row, version }),
      expectedVersion,
    });
  }
}

function stageKey(table: string, id: string): string {
  return `${table}\u0000${id}`;
}
