import type { DataLayer } from '@/data';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { MockRepository } from '@/data/mock/MockRepository';
import type { Scenario } from '@/data/mock/seed';
import { createMockStore, type MockStore } from '@/data/mock/store';
import type { DataRepository, NewProjectInput } from '@/data/repository';
import type { ID } from '@/data/types';
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
  /** Share of reads that fail. Every random draw is 0, so any value above 0 fails every read. */
  failRate?: number;
  /** Seed time; `new Date()` by default. */
  now?: Date;
  /** Methods that replace the mock repository's own. */
  overrides?: Partial<DataRepository>;
}

/** The mock data layer over in-memory storage, with no latency; signed in as the seed user. */
export function createTestDataLayer(options: TestDataLayerOptions = {}): TestDataLayer {
  const { scenario = 'default', failRate = 0, now = new Date(), overrides = {} } = options;
  const store = createMockStore({ storage: createMemoryStorage(), scenario, now: () => now });
  const repository = new MockRepository({ store, latencyMs: 0, failRate, random: () => 0 });
  Object.assign(repository, overrides);
  return { repository, auth: new MockAuthService({ store, latencyMs: 0 }), store };
}
