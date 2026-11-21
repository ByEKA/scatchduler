import {
  makeSeedScheduleDocument,
  seed,
  type MockDb,
  type Scenario,
} from '@/data/mock/seed';
import type { ScheduleDocument } from '@/data/schedule-types';
import type { Role } from '@/data/types';
import { readKey, removeKey, writeKey, type StorageLike } from '@/lib/storage';

/**
 * localStorage key of the mock database. It keeps its `v1` suffix across `MockDb` versions (P2
 * spec §6.4): the stored `version` decides whether the data is kept.
 */
export const MOCK_DB_KEY = 'mock-db.v1';

/** Separate per-snapshot localStorage prefix so large schedules never rewrite `mock-db.v1`. */
export const MOCK_SNAPSHOT_PREFIX = 'mock-schedule-data.v1:';

const MOCK_DB_VERSION: MockDb['version'] = 4;

export interface MockStore {
  /** A deep copy of the current database. */
  read(): MockDb;
  /** Runs `mutate` on a copy, then keeps and persists that copy; returns another copy of it. */
  write(mutate: (draft: MockDb) => void): MockDb;
  /** Replaces the database with a new seed of the store's scenario and team role. */
  reset(): MockDb;
  /** Reads a deep copy of a stored `ScheduleDocument` snapshot, or `null` if absent. */
  readSnapshot(path: string): ScheduleDocument | null;
  /** Stores a deep copy of a `ScheduleDocument` snapshot under its own key (memory + storage). */
  writeSnapshot(path: string, document: ScheduleDocument): void;
  /** Removes a stored `ScheduleDocument` snapshot from memory and storage. */
  removeSnapshot(path: string): void;
}

export interface MockStoreOptions {
  /** `null` when the browser gives no storage; the store then lives in memory only. */
  storage: StorageLike | null;
  scenario: Scenario;
  /** The current user's role in Site Operations; `'owner'` by default. */
  teamRole?: Role;
  /** Seed time; `new Date()` by default. */
  now?: () => Date;
}

// The database holds only JSON values (no Dates, Maps or undefined), so a JSON round trip is a
// full deep copy.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The stored database, or `null` when there is none or it has to be thrown away. Throwing data
 * away (not JSON, or another version) logs one warning. An empty key is a first visit and logs
 * nothing.
 */
function readStored(storage: StorageLike | null): MockDb | null {
  const raw = readKey(MOCK_DB_KEY, storage);
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    console.warn(`Mock store: could not parse "${MOCK_DB_KEY}"; seeding new data.`, error);
    return null;
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== MOCK_DB_VERSION
  ) {
    console.warn(
      `Mock store: "${MOCK_DB_KEY}" does not hold version ${MOCK_DB_VERSION} data; seeding new data.`,
    );
    return null;
  }
  return value as MockDb;
}

export function createMockStore({
  storage,
  scenario,
  teamRole = 'owner',
  now = () => new Date(),
}: MockStoreOptions): MockStore {
  const snapshots = new Map<string, string>();

  const writeSnapshot = (path: string, document: ScheduleDocument): void => {
    const text = JSON.stringify(document);
    snapshots.set(path, text);
    writeKey(`${MOCK_SNAPSHOT_PREFIX}${path}`, text, storage);
  };

  const removeSnapshot = (path: string): void => {
    snapshots.delete(path);
    removeKey(`${MOCK_SNAPSHOT_PREFIX}${path}`, storage);
  };

  const readSnapshot = (path: string): ScheduleDocument | null => {
    const cached = snapshots.get(path);
    if (cached !== undefined) return JSON.parse(cached) as ScheduleDocument;
    const raw = readKey(`${MOCK_SNAPSHOT_PREFIX}${path}`, storage);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as ScheduleDocument;
      snapshots.set(path, raw);
      return parsed;
    } catch {
      return null;
    }
  };

  const hydrateSeedSnapshots = (next: MockDb): void => {
    for (const schedule of next.schedules) {
      if (schedule.dataFilePath !== null) {
        writeSnapshot(schedule.dataFilePath, makeSeedScheduleDocument(schedule.statusDate));
      }
    }
  };

  const persist = (next: MockDb): MockDb => {
    const text = JSON.stringify(next);
    writeKey(MOCK_DB_KEY, text, storage);
    return JSON.parse(text) as MockDb;
  };

  const reseed = (): MockDb => {
    for (const path of snapshots.keys()) removeSnapshot(path);
    const next = persist(seed(scenario, now(), { teamRole }));
    hydrateSeedSnapshots(next);
    return next;
  };

  const stored = readStored(storage);
  let db = stored?.scenario === scenario && stored.teamRole === teamRole ? stored : reseed();

  return {
    read: () => clone(db),
    write(mutate) {
      const draft = clone(db);
      mutate(draft);
      db = persist(draft);
      return clone(db);
    },
    reset() {
      db = reseed();
      return clone(db);
    },
    readSnapshot,
    writeSnapshot,
    removeSnapshot,
  };
}
