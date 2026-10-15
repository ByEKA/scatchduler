import { addDays, format, subDays } from 'date-fns';
import type { Session } from '@/data/auth';
import type {
  ID,
  ISODate,
  ISODateTime,
  Project,
  Schedule,
  Subscription,
  Task,
  User,
  Workspace,
  WorkspaceKind,
} from '@/data/types';

export type Scenario = 'default' | 'empty';

/** One schedule shared with one user; the repository joins it into a `SharedScheduleRow`. */
export interface MockShare {
  id: ID;
  scheduleId: ID;
  sharedById: ID;
  sharedWithId: ID;
  sharedAt: ISODateTime;
}

/** The whole mock database, stored as one JSON document (spec §5.6). */
export interface MockDb {
  version: 1;
  scenario: Scenario;
  seededAt: ISODateTime;
  currentUserId: ID;
  session: Session | null;
  users: User[];
  subscription: Subscription;
  workspaces: Workspace[];
  projects: Project[];
  schedules: Schedule[];
  shares: MockShare[];
  tasks: Task[];
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

interface SeedProject {
  code: string;
  name: string;
  workspace: WorkspaceKind;
  /** How long before the seed time the project was last updated. */
  updatedMsAgo: number;
  statusDaysBefore: number | null;
  schedules: string[];
}

// The `default` projects in creation order, with their schedules in order.
const DEFAULT_PROJECTS: SeedProject[] = [
  {
    code: '001',
    name: 'Riverside Office Tower',
    workspace: 'personal',
    updatedMsAgo: 3 * MINUTE_MS,
    statusDaysBefore: 2,
    schedules: ['Main schedule'],
  },
  {
    code: '002',
    name: 'Metro Line Extension',
    workspace: 'personal',
    updatedMsAgo: 2 * DAY_MS,
    statusDaysBefore: null,
    schedules: [],
  },
  {
    code: '003',
    name: 'Harbor Logistics Hub',
    workspace: 'personal',
    updatedMsAgo: 5 * DAY_MS,
    statusDaysBefore: 7,
    schedules: ['Baseline', 'Update 1', 'Update 2'],
  },
  {
    code: '004',
    name: 'Campus Library Retrofit',
    workspace: 'personal',
    updatedMsAgo: 21 * DAY_MS,
    statusDaysBefore: 14,
    schedules: ['Baseline', 'Recovery plan'],
  },
  {
    code: '005',
    name: 'Northgate Bridge Repair',
    workspace: 'personal',
    updatedMsAgo: 35 * DAY_MS,
    statusDaysBefore: null,
    schedules: ['Baseline'],
  },
  {
    code: '006',
    name: 'Old Mill Housing',
    workspace: 'personal',
    updatedMsAgo: 60 * DAY_MS,
    statusDaysBefore: 30,
    schedules: [],
  },
  {
    code: 'T-01',
    name: 'Tunnel Ventilation Upgrade',
    workspace: 'team',
    updatedMsAgo: 7 * DAY_MS,
    statusDaysBefore: 3,
    schedules: ['Baseline rev. 3', 'Look-ahead W42'],
  },
];

function makeUser(firstName: string, lastName: string, email: string): User {
  return { id: crypto.randomUUID(), firstName, lastName, email, avatarUrl: null };
}

function makeWorkspace(name: string, kind: WorkspaceKind, createdAt: ISODateTime): Workspace {
  return { id: crypto.randomUUID(), name, kind, createdAt };
}

/** `items.find(match)` for lookups that the seed table above always satisfies. */
function findOrThrow<T>(items: T[], match: (item: T) => boolean, label: string): T {
  const item = items.find(match);
  if (item === undefined) throw new Error(`Seed data has no ${label}`);
  return item;
}

/** A new database for `scenario`; all times and dates count back or forward from `now`. */
export function seed(scenario: Scenario, now: Date): MockDb {
  // Timestamps move by exact milliseconds. addDays / subDays keep the wall-clock time instead, so
  // across a daylight-saving change "9 days left" would read 10 and "1 day ago" "23 hours ago".
  const msAgo = (ms: number): ISODateTime => new Date(now.getTime() - ms).toISOString();
  // Status and due dates are local calendar days.
  const daysBefore = (days: number): ISODate => format(subDays(now, days), 'yyyy-MM-dd');
  const daysAfter = (days: number): ISODate => format(addDays(now, days), 'yyyy-MM-dd');

  const deniz = makeUser('Deniz', 'Kaya', 'deniz.kaya@example.com');
  const personal = makeWorkspace('My workspace', 'personal', msAgo(90 * DAY_MS));
  const db: MockDb = {
    version: 1,
    scenario,
    seededAt: now.toISOString(),
    currentUserId: deniz.id,
    session: { userId: deniz.id },
    users: [deniz],
    subscription: {
      plan: 'trial',
      trialEndsAt: new Date(now.getTime() + 9 * DAY_MS).toISOString(),
    },
    workspaces: [personal],
    projects: [],
    schedules: [],
    shares: [],
    tasks: [],
  };
  if (scenario === 'empty') return db;

  const mert = makeUser('Mert', 'Demir', 'mert.demir@example.com');
  const elif = makeUser('Elif', 'Arslan', 'elif.arslan@example.com');
  const team = makeWorkspace('Site Operations', 'team', msAgo(30 * DAY_MS));
  db.users.push(mert, elif);
  db.workspaces.push(team);

  for (const row of DEFAULT_PROJECTS) {
    const updatedAt = msAgo(row.updatedMsAgo);
    const statusDate = row.statusDaysBefore === null ? null : daysBefore(row.statusDaysBefore);
    const project: Project = {
      id: crypto.randomUUID(),
      workspaceId: row.workspace === 'team' ? team.id : personal.id,
      code: row.code,
      name: row.name,
      description: null,
      coverImageUrl: null,
      statusDate,
      attributes: { projectType: null, startDate: null, plannedFinishDate: null },
      client: { name: null, contactName: null, contactEmail: null },
      location: { address: null, city: null, country: null },
      createdAt: msAgo(row.updatedMsAgo + 30 * DAY_MS),
      updatedAt,
    };
    db.projects.push(project);
    for (const name of row.schedules) {
      db.schedules.push({
        id: crypto.randomUUID(),
        projectId: project.id,
        name,
        statusDate,
        source: 'blank',
        sourceFileName: null,
        createdAt: updatedAt,
        updatedAt,
      });
    }
  }

  const projectId = (code: string): ID =>
    findOrThrow(db.projects, (p) => p.code === code, `project ${code}`).id;
  const scheduleId = (name: string): ID =>
    findOrThrow(db.schedules, (s) => s.name === name, `schedule "${name}"`).id;

  db.shares.push(
    {
      id: crypto.randomUUID(),
      scheduleId: scheduleId('Baseline rev. 3'),
      sharedById: mert.id,
      sharedWithId: deniz.id,
      sharedAt: msAgo(DAY_MS),
    },
    {
      id: crypto.randomUUID(),
      scheduleId: scheduleId('Look-ahead W42'),
      sharedById: elif.id,
      sharedWithId: deniz.id,
      sharedAt: msAgo(4 * DAY_MS),
    },
  );

  db.tasks.push(
    {
      id: crypto.randomUUID(),
      title: 'Update status date for Riverside Office Tower',
      dueDate: daysAfter(0),
      done: false,
      projectId: projectId('001'),
      createdAt: msAgo(DAY_MS),
    },
    {
      id: crypto.randomUUID(),
      title: 'Import revised baseline from contractor',
      dueDate: daysAfter(3),
      done: false,
      projectId: projectId('003'),
      createdAt: msAgo(2 * DAY_MS),
    },
    {
      id: crypto.randomUUID(),
      title: 'Review look-ahead schedule',
      dueDate: null,
      done: false,
      projectId: projectId('T-01'),
      createdAt: msAgo(3 * DAY_MS),
    },
  );

  return db;
}
