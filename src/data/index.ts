// The only module that picks and builds a data adapter (spec §4.1; P2 spec §4.2). UI code reaches
// the result through `DataLayerProvider` and the hooks in `src/hooks`.
import type { AuthService } from '@/data/auth';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { MockRepository } from '@/data/mock/MockRepository';
import type { Scenario } from '@/data/mock/seed';
import { createMockStore } from '@/data/mock/store';
import type { DataRepository } from '@/data/repository';
import { createSupabaseClient } from '@/data/supabase/client';
import { SupabaseAuthService } from '@/data/supabase/SupabaseAuthService';
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository';
import type { Role } from '@/data/types';
import { getBrowserStorage, type StorageLike } from '@/lib/storage';

export interface DataLayer {
  repository: DataRepository;
  auth: AuthService;
}

export interface DataLayerEnv {
  VITE_DATA_SOURCE?: string;
  VITE_MOCK_SCENARIO?: string;
  VITE_MOCK_TEAM_ROLE?: string;
  VITE_MOCK_LATENCY_MS?: string;
  VITE_MOCK_FAIL_RATE?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
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

/** The demo user's role in Site Operations (P2 spec §4.2); any other value means `owner`. */
function teamRoleFrom(env: DataLayerEnv): Role {
  const value = envValue(env.VITE_MOCK_TEAM_ROLE);
  return value === 'editor' || value === 'viewer' ? value : 'owner';
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
 * One client shared by the repository and the auth service (P2 spec §8.1). Building it makes no
 * network call; the Supabase values are read only for this source (P2 spec §4.2).
 */
function createSupabaseLayer(env: DataLayerEnv, storage: StorageLike | null): DataLayer {
  const url = envValue(env.VITE_SUPABASE_URL);
  if (url === undefined) throw new Error('Missing VITE_SUPABASE_URL');
  const publishableKey = envValue(env.VITE_SUPABASE_PUBLISHABLE_KEY);
  if (publishableKey === undefined) throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
  const client = createSupabaseClient({ url, publishableKey, storage });
  return {
    repository: new SupabaseRepository(client),
    auth: new SupabaseAuthService(client, { origin: () => window.location.origin }),
  };
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
  if (source === 'supabase') return createSupabaseLayer(env, storage);
  if (source !== 'mock') {
    throw new Error(`Unknown VITE_DATA_SOURCE "${source}"`);
  }

  const scenario = scenarioFrom(env);
  const teamRole = teamRoleFrom(env);
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

  const store = createMockStore({ storage, scenario, teamRole });
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
