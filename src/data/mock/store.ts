import { seed, type MockDb, type Scenario } from '@/data/mock/seed';
import { readKey, writeKey, type StorageLike } from '@/lib/storage';

/** localStorage key of the mock database; the suffix follows `MockDb['version']`. */
export const MOCK_DB_KEY = 'mock-db.v1';

export interface MockStore {
  /** A deep copy of the current database. */
  read(): MockDb;
  /** Runs `mutate` on a copy, then keeps and persists that copy; returns another copy of it. */
  write(mutate: (draft: MockDb) => void): MockDb;
  /** Replaces the database with a new seed of the store's scenario. */
  reset(): MockDb;
}

export interface MockStoreOptions {
  /** `null` when the browser gives no storage; the store then lives in memory only. */
  storage: StorageLike | null;
  scenario: Scenario;
  /** Seed time; `new Date()` by default. */
  now?: () => Date;
}

// The database holds only JSON values (no Dates, Maps or undefined), so a JSON round trip is a
// full deep copy.
function clone(db: MockDb): MockDb {
  return JSON.parse(JSON.stringify(db)) as MockDb;
}

/**
 * The stored database, or `null` when there is none or it has to be thrown away. Throwing data
 * away (not JSON, or not version 1) logs one warning. An empty key is a first visit and logs
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
  // The version is the shape contract: a version 1 document is taken to have the MockDb shape.
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 1) {
    console.warn(`Mock store: "${MOCK_DB_KEY}" does not hold version 1 data; seeding new data.`);
    return null;
  }
  return value as MockDb;
}

export function createMockStore({
  storage,
  scenario,
  now = () => new Date(),
}: MockStoreOptions): MockStore {
  // writeKey never throws: blocked storage or a full quota leave the change in memory only. The
  // kept state is parsed back from the stored text, so no object a caller reached inside
  // `mutate` (or passed in) stays linked to it.
  const persist = (next: MockDb): MockDb => {
    const text = JSON.stringify(next);
    writeKey(MOCK_DB_KEY, text, storage);
    return JSON.parse(text) as MockDb;
  };
  const reseed = (): MockDb => persist(seed(scenario, now()));

  const stored = readStored(storage);
  // A stored scenario that differs from the requested one means VITE_MOCK_SCENARIO changed; that
  // reseeds without a warning.
  let db = stored?.scenario === scenario ? stored : reseed();

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
  };
}
