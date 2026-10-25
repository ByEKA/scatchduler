import type { DataLayer } from '@/data';
import type { AuthService, Session } from '@/data/auth';
import { RepositoryError } from '@/data/errors';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { MockRepository } from '@/data/mock/MockRepository';
import type { Scenario } from '@/data/mock/seed';
import { createMockStore, type MockStore } from '@/data/mock/store';
import type { DataRepository, NewProjectInput } from '@/data/repository';
import type { ID, Role } from '@/data/types';
import { createMemoryStorage } from '@/lib/storage';

/** A valid `NewProjectInput`: code `'900'`, name `'Test project'`, every optional value `null`. */
export function makeNewProjectInput(
  workspaceId: ID,
  overrides: Partial<NewProjectInput> = {},
): NewProjectInput {
  return {
    workspaceId,
    code: '900',
    name: 'Test project',
    description: null,
    coverImage: null,
    statusDate: null,
    attributes: { projectType: null, startDate: null, plannedFinishDate: null },
    client: { name: null, contactName: null, contactEmail: null },
    location: { address: null, city: null, country: null },
    ...overrides,
  };
}

export interface TestDataLayer extends DataLayer {
  repository: MockRepository;
  store: MockStore;
}

export interface TestDataLayerOptions {
  scenario?: Scenario;
  /** The seed user's role in Site Operations; `'owner'` by default. */
  teamRole?: Role;
  /** Share of reads that fail. Every random draw is 0, so any value above 0 fails every read. */
  failRate?: number;
  /** Seed time; `new Date()` by default. */
  now?: Date;
  /** Methods that replace the mock repository's own. */
  overrides?: Partial<DataRepository>;
}

/** The mock data layer over in-memory storage, with no latency; signed in as the seed user. */
export function createTestDataLayer(options: TestDataLayerOptions = {}): TestDataLayer {
  const {
    scenario = 'default',
    teamRole,
    failRate = 0,
    now = new Date(),
    overrides = {},
  } = options;
  const store = createMockStore({
    storage: createMemoryStorage(),
    scenario,
    teamRole,
    now: () => now,
  });
  const repository = new MockRepository({ store, latencyMs: 0, failRate, random: () => 0 });
  Object.assign(repository, overrides);
  return { repository, auth: new MockAuthService({ store, latencyMs: 0 }), store };
}

/**
 * An `AuthService` whose session only changes when a test says so: `emit(session)` sets it and
 * tells the listeners, as a provider event would. Signed out by default. Its sign-in methods sign
 * in `{ userId: 'fake-user' }`.
 */
export function createFakeAuth(initial: Session | null = null): {
  auth: AuthService;
  emit(session: Session | null): void;
} {
  let session = initial;
  const listeners = new Set<(session: Session | null) => void>();
  const emit = (next: Session | null): void => {
    session = next;
    for (const listener of [...listeners]) listener(next);
  };
  const signIn = async (): Promise<void> => {
    emit({ userId: 'fake-user' });
  };
  const auth: AuthService = {
    getSession: async () => session,
    signInWithPassword: signIn,
    signInWithGoogle: signIn,
    completeOAuthSignIn: async () => undefined,
    requestPasswordReset: async () => undefined,
    verifyEmailLink: signIn,
    updatePassword: async () => {
      if (session === null) {
        throw new RepositoryError('unauthorized', 'Your session expired. Please sign in again.');
      }
    },
    signOut: async () => {
      emit(null);
    },
    onAuthStateChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { auth, emit };
}
