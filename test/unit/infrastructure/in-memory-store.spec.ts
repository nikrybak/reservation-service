import { ConcurrencyConflictError } from '../../../src/shared/application/errors';
import { InMemoryStore } from '../../../src/shared/persistence/in-memory/in-memory-store';

interface Row {
  id: string;
  value: string;
  version: number;
}

function setup() {
  const store = new InMemoryStore();
  const table = store.table<Row>('rows', [(row) => row.value]);
  return { store, table };
}

describe('InMemoryStore', () => {
  it('assigns version 1 on insert and bumps it on update', () => {
    const { table } = setup();
    table.insert('a', { id: 'a', value: 'one' });
    table.update('a', { id: 'a', value: 'two' }, 1);
    expect(table.get('a')).toEqual({ id: 'a', value: 'two', version: 2 });
  });

  it('rejects an update based on a stale version', () => {
    const { table } = setup();
    table.insert('a', { id: 'a', value: 'one' });
    table.update('a', { id: 'a', value: 'two' }, 1);
    expect(() => table.update('a', { id: 'a', value: 'three' }, 1)).toThrow(ConcurrencyConflictError);
  });

  it('enforces unique keys', () => {
    const { table } = setup();
    table.insert('a', { id: 'a', value: 'same' });
    expect(() => table.insert('b', { id: 'b', value: 'same' })).toThrow(ConcurrencyConflictError);
  });

  it('discards staged writes when the transaction fails', async () => {
    const { store, table } = setup();
    await expect(
      store.run(async () => {
        table.insert('a', { id: 'a', value: 'one' });
        expect(table.get('a')?.value).toBe('one');
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(table.get('a')).toBeUndefined();
  });

  it('fails the slower of two transactions that wrote the same row', async () => {
    const { store, table } = setup();
    table.insert('a', { id: 'a', value: 'one' });
    let resume: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });

    const slow = store.run(async () => {
      const row = table.get('a');
      await gate;
      table.update('a', { id: 'a', value: 'slow' }, row?.version ?? 0);
    });
    await store.run(() => {
      table.update('a', { id: 'a', value: 'fast' }, table.get('a')?.version ?? 0);
      return Promise.resolve();
    });
    resume();

    await expect(slow).rejects.toThrow(ConcurrencyConflictError);
    expect(table.get('a')?.value).toBe('fast');
  });

  it('validates repeated writes to one row against the version first read', async () => {
    const { store, table } = setup();
    table.insert('a', { id: 'a', value: 'one' });

    await store.run(() => {
      table.update('a', { id: 'a', value: 'two' }, 1);
      const staged = table.get('a');
      table.update('a', { id: 'a', value: 'three' }, staged?.version ?? 0);
      return Promise.resolve();
    });

    expect(table.get('a')).toEqual({ id: 'a', value: 'three', version: 2 });
  });
});
