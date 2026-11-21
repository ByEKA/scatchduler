import type { DataLayer } from '@/data';
import type { AuthService, Session } from '@/data/auth';
import { RepositoryError } from '@/data/errors';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { MockRepository } from '@/data/mock/MockRepository';
import type { Scenario } from '@/data/mock/seed';
import { createMockStore, type MockStore } from '@/data/mock/store';
import type {
  DataRepository,
  ImportScheduleInput,
  NewProjectInput,
  UpdateProjectInput,
} from '@/data/repository';
import type { ScheduleDocument } from '@/data/schedule-types';
import type { ID, Project, Role } from '@/data/types';
import { createMemoryStorage } from '@/lib/storage';

/** A valid minimal `ScheduleDocument` for contract and unit tests. */
export function makeSampleScheduleDocument(
  overrides: Partial<ScheduleDocument> = {},
): ScheduleDocument {
  return {
    schemaVersion: 1,
    sourceFormat: null,
    settings: {
      profile: 'default',
      ruleOverrides: {},
      progressMode: 'retained_logic',
      displayMode: 'calculated',
      lagCalendar: 'predecessor',
      criticalDefinition: 'total_float',
      criticalThresholdMinutes: 0,
      nearCriticalThresholdMinutes: 4800,
      projectStart: '2026-10-01T08:00',
      mustFinishBy: null,
      statusDate: '2026-10-05T08:00',
      defaultCalendarId: 'cal:standard',
      autoCalculate: false,
    },
    calendars: [
      {
        id: 'cal:standard',
        name: 'Standard',
        kind: 'project',
        week: [
          [],
          [
            { start: 480, finish: 720 },
            { start: 780, finish: 1020 },
          ],
          [
            { start: 480, finish: 720 },
            { start: 780, finish: 1020 },
          ],
          [
            { start: 480, finish: 720 },
            { start: 780, finish: 1020 },
          ],
          [
            { start: 480, finish: 720 },
            { start: 780, finish: 1020 },
          ],
          [
            { start: 480, finish: 720 },
            { start: 780, finish: 1020 },
          ],
          [],
        ],
        exceptions: [],
        hoursPerDay: 8,
        hoursPerWeek: 40,
        hoursPerMonth: 160,
        hoursPerYear: 1920,
      },
    ],
    wbs: [{ id: 'wbs:1', parentId: null, code: '1', name: 'Site work', order: 0 }],
    activities: [
      {
        id: 'act:00000',
        code: 'A1000',
        name: 'Mobilize',
        wbsId: 'wbs:1',
        calendarId: 'cal:standard',
        type: 'task',
        order: 0,
        originalDuration: 960,
        remainingDuration: 960,
        status: 'not_started',
        actualStart: null,
        actualFinish: null,
        percent: { duration: 0, physical: null, type: 'duration' },
        constraint: null,
        secondaryConstraint: null,
        notes: null,
        flags: { manual: false, elapsed: false, resourceDependent: false },
        keys: { taskId: null, uid: null, guid: null },
        sourceDates: null,
      },
      {
        id: 'act:00001',
        code: 'A1010',
        name: 'Excavate',
        wbsId: 'wbs:1',
        calendarId: 'cal:standard',
        type: 'task',
        order: 1,
        originalDuration: 1440,
        remainingDuration: 1440,
        status: 'not_started',
        actualStart: null,
        actualFinish: null,
        percent: { duration: 0, physical: null, type: 'duration' },
        constraint: null,
        secondaryConstraint: null,
        notes: null,
        flags: { manual: false, elapsed: false, resourceDependent: false },
        keys: { taskId: null, uid: null, guid: null },
        sourceDates: null,
      },
    ],
    relationships: [
      {
        id: 'rel:00000',
        predecessorId: 'act:00000',
        successorId: 'act:00001',
        type: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      },
    ],
    computed: null,
    ...overrides,
  };
}

/**
 * A valid `NewProjectInput`: code `'900'`, name `'Test project'`, status `'active'`, every
 * optional value `null`.
 */
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
    attributes: {
      status: 'active',
      stage: null,
      projectType: null,
      sector: null,
      startDate: null,
      plannedFinishDate: null,
    },
    client: { name: null, contactName: null, contactEmail: null },
    location: { address: null, city: null, country: null, latitude: null, longitude: null },
    ...overrides,
  };
}

/** An `UpdateProjectInput` that saves the project's own values, keeps its cover and status date. */
export function makeUpdateProjectInput(
  project: Project,
  overrides: Partial<UpdateProjectInput> = {},
): UpdateProjectInput {
  return {
    projectId: project.id,
    code: project.code,
    name: project.name,
    description: project.description,
    cover: 'keep',
    statusDate: project.statusDate,
    attributes: { ...project.attributes },
    client: { ...project.client },
    location: { ...project.location },
    ...overrides,
  };
}

/** The parser fixtures `makeImportScheduleInput` imports, with their schedule's name and code. */
const IMPORT_FIXTURES = {
  'two-projects.xer': {
    name: 'North Plant',
    code: 'NTH-A',
    bytes: () => import('@/import/__fixtures__/two-projects.xer?bytes'),
  },
  'dates-1900.xlsx': {
    name: 'Dates 1900',
    code: 'D1900',
    bytes: () => import('@/import/__fixtures__/dates-1900.xlsx?bytes'),
  },
} as const;

/** The file name without its last extension. */
const baseName = (fileName: string): string => fileName.replace(/\.[^.]*$/, '');

/**
 * A full `ImportScheduleInput` from a parser fixture, built as the import dialog builds it (spec
 * §5.1): the file is inspected for its mapping (the XER's North Plant project, `sourceProjectId`
 * 101), analyzed and packed, so `stored`, `mapping` and `report` are real. The status date is the
 * report's and the activity count its accepted activities. `options.file` replaces the fixture
 * (read as an XER when its name ends in `.xer`); its name and code are the options' or else the
 * file name without its extension. Any other option replaces the built value.
 */
export async function makeImportScheduleInput(
  projectId: ID,
  options: { fixture?: 'two-projects.xer' | 'dates-1900.xlsx' } & Partial<ImportScheduleInput> = {},
): Promise<ImportScheduleInput> {
  const { fixture: fixtureName = 'two-projects.xer', ...overrides } = options;
  // Loaded on first use, so the many tests that import this module never load the parser.
  const { analyze, inspect, pack } = await import('@/import/index');
  const fixture = IMPORT_FIXTURES[fixtureName];
  const file = overrides.file ?? new File([(await fixture.bytes()).default], fixtureName);
  const named = overrides.file ? { name: baseName(file.name), code: baseName(file.name) } : fixture;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const inspected = await inspect(bytes, file.name);
  if (inspected.kind === 'refused') throw new Error(`${file.name}: ${inspected.message}`);
  const { mapping } = inspected;
  const analyzed = await analyze(bytes, file.name, mapping);
  if (analyzed.kind !== 'analyzed') throw new Error(`${file.name}: ${analyzed.message}`);
  const packed = await pack(bytes, file.name, analyzed.report);
  const { report } = packed;
  const gzipped = report.format !== 'xlsx';
  const stored = new Blob([packed.stored.slice()], {
    type: gzipped
      ? 'application/gzip'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return {
    projectId,
    name: named.name,
    code: named.code,
    file,
    stored,
    statusDate: report.statusDate.date,
    activityCount: report.counts.find((count) => count.entity === 'activity')?.accepted ?? 0,
    sourceProjectCode: report.sourceProject.code,
    mapping,
    report,
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
