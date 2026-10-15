import { describe, expect, it, vi } from 'vitest';
import { createMockStore, MOCK_DB_KEY } from '@/data/mock/store';
import type { Task } from '@/data/types';
import { createMemoryStorage, type StorageLike } from '@/lib/storage';

const now = () => new Date('2026-10-14T10:00:00.000Z');
const blocked: StorageLike = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('mock store', () => {
  it('seeds and persists when storage is empty', () => {
    const storage = createMemoryStorage();
    const store = createMockStore({ storage, scenario: 'default', now });
    expect(store.read().projects).toHaveLength(7);
    expect(JSON.parse(storage.getItem(MOCK_DB_KEY)!)).toMatchObject({
      version: 1,
      scenario: 'default',
    });
  });

  it('reuses persisted data across instances', () => {
    const storage = createMemoryStorage();
    createMockStore({ storage, scenario: 'default', now }).write((db) => {
      db.tasks = [];
    });
    expect(createMockStore({ storage, scenario: 'default', now }).read().tasks).toEqual([]);
  });

  it('returns copies so callers cannot mutate state', () => {
    const store = createMockStore({ storage: createMemoryStorage(), scenario: 'default', now });
    store.read().tasks.pop();
    expect(store.read().tasks).toHaveLength(3);
  });

  it('reseeds unreadable data with one warning', () => {
    const storage = createMemoryStorage();
    storage.setItem(MOCK_DB_KEY, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createMockStore({ storage, scenario: 'default', now }).read().projects).toHaveLength(7);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('reseeds when the scenario changes', () => {
    const storage = createMemoryStorage();
    createMockStore({ storage, scenario: 'default', now });
    expect(createMockStore({ storage, scenario: 'empty', now }).read().projects).toEqual([]);
  });

  it('keeps working in memory when storage is blocked or missing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const storage of [blocked, null]) {
      const store = createMockStore({ storage, scenario: 'default', now });
      store.write((db) => {
        db.tasks = [];
      });
      expect(store.read().tasks).toEqual([]);
    }
  });

  it('keeps no live reference to objects reached inside write', () => {
    const store = createMockStore({ storage: createMemoryStorage(), scenario: 'default', now });
    let captured: Task | undefined;
    store.write((db) => {
      captured = db.tasks[0];
    });
    captured!.title = 'changed';
    expect(store.read().tasks[0]!.title).toBe('Update status date for Riverside Office Tower');
  });

  it('reseeds data of another version with one warning that names the key', () => {
    const storage = createMemoryStorage();
    storage.setItem(MOCK_DB_KEY, JSON.stringify({ version: 2, projects: [] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(createMockStore({ storage, scenario: 'default', now }).read().projects).toHaveLength(7);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain(MOCK_DB_KEY);
  });

  it('persists the new seed on reset', () => {
    const storage = createMemoryStorage();
    const store = createMockStore({ storage, scenario: 'default', now });
    store.write((db) => {
      db.tasks = [];
    });
    expect(store.reset().tasks).toHaveLength(3);
    expect(createMockStore({ storage, scenario: 'default', now }).read().tasks).toHaveLength(3);
  });
});
