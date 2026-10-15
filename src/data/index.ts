// The only module that picks and builds a data adapter (spec §4.1). UI code reaches the result
// through `DataLayerProvider` and the hooks in `src/hooks`.
import type { AuthService } from '@/data/auth';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { MockRepository } from '@/data/mock/MockRepository';
import type { Scenario } from '@/data/mock/seed';
import { createMockStore } from '@/data/mock/store';
import type { DataRepository } from '@/data/repository';
import { getBrowserStorage, type StorageLike } from '@/lib/storage';

export interface DataLayer {
  repository: DataRepository;
  auth: AuthService;
}

export interface DataLayerEnv {
  VITE_DATA_SOURCE?: string;
  VITE_MOCK_SCENARIO?: string;
  VITE_MOCK_LATENCY_MS?: string;
  VITE_MOCK_FAIL_RATE?: string;
}

const DEFAULT_LATENCY_MS = 400;
const DEFAULT_FAIL_RATE = 0;

/** The trimmed value, or `undefined` when the variable is missing or blank. */
function envValue(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value === '' ? undefined : value;
}

function scenarioFrom(env: DataLayerEnv): Scenario {
  const value = envValue(env.VITE_MOCK_SCENARIO) ?? 'default';
  if (value === 'default' || value === 'empty') return value;
  throw new Error(`Unknown VITE_MOCK_SCENARIO "${value}". Use default or empty.`);
}

function numberFrom(
  name: 'VITE_MOCK_LATENCY_MS' | 'VITE_MOCK_FAIL_RATE',
  raw: string | undefined,
  fallback: number,
  isValid: (value: number) => boolean,
  hint: string,
): number {
  const value = envValue(raw);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !isValid(parsed)) {
    throw new Error(`Invalid ${name} "${value}". ${hint}`);
  }
  return parsed;
}

/**
 * Builds the repository and auth service named by `VITE_DATA_SOURCE` (`mock` when unset). Throws
 * when the env asks for a source or a mock setting that does not exist; the app shows that
 * message instead of starting.
 */
export function createDataLayer(
  env: DataLayerEnv = import.meta.env,
  storage: StorageLike | null = getBrowserStorage(),
): DataLayer {
  const source = envValue(env.VITE_DATA_SOURCE) ?? 'mock';
  if (source === 'supabase') {
    throw new Error(
      'Supabase data source is not implemented yet (Phase 2). Set VITE_DATA_SOURCE=mock.',
    );
  }
  if (source !== 'mock') {
    throw new Error(`Unknown VITE_DATA_SOURCE "${source}"`);
  }

  const scenario = scenarioFrom(env);
  const latencyMs = numberFrom(
    'VITE_MOCK_LATENCY_MS',
    env.VITE_MOCK_LATENCY_MS,
    DEFAULT_LATENCY_MS,
    (value) => value >= 0,
    'Use a number of milliseconds, 0 or more.',
  );
  const failRate = numberFrom(
    'VITE_MOCK_FAIL_RATE',
    env.VITE_MOCK_FAIL_RATE,
    DEFAULT_FAIL_RATE,
    (value) => value >= 0 && value <= 1,
    'Use a number from 0 to 1.',
  );

  const store = createMockStore({ storage, scenario });
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__resetMockDb = () => {
      store.reset();
      window.location.reload();
    };
  }

  return {
    repository: new MockRepository({ store, latencyMs, failRate }),
    auth: new MockAuthService({ store, latencyMs }),
  };
}
