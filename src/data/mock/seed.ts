import { addDays, format, subDays } from 'date-fns';
import type { Session } from '@/data/auth';
import type {
  BaselineFlag,
  ID,
  ISODate,
  ISODateTime,
  Project,
  ProjectSector,
  ProjectStage,
  ProjectStatus,
  ProjectType,
  Role,
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

/** One user's role in one workspace (P2 spec §6.4). */
export interface MockMember {
  workspaceId: ID;
  userId: ID;
  role: Role;
  joinedAt: ISODateTime;
}

/**
 * An invitation to a workspace (P2 spec §5.7). It is pending while `acceptedAt` and `revokedAt`
 * are both `null`; `email` is stored trimmed and lowercased.
 */
export interface MockInvitation {
  id: ID;
  workspaceId: ID;
  email: string;
  role: Role;
  invitedById: ID | null;
  invitedAt: ISODateTime;
  acceptedAt: ISODateTime | null;
  revokedAt: ISODateTime | null;
}

/** The whole mock database, stored as one JSON document (spec §5.6, P2 spec §6.4). */
export interface MockDb {
  version: 3;
  scenario: Scenario;
  /** The current user's seeded role in Site Operations; a different requested role reseeds. */
  teamRole: Role;
  seededAt: ISODateTime;
  currentUserId: ID;
  session: Session | null;
  users: User[];
  subscription: Subscription;
  workspaces: Workspace[];
  members: MockMember[];
  invitations: MockInvitation[];
  projects: Project[];
  schedules: Schedule[];
  shares: MockShare[];
  tasks: Task[];
}

export interface SeedOptions {
  /** The current user's role in Site Operations; `'owner'` by default (`VITE_MOCK_TEAM_ROLE`). */
  teamRole?: Role;
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** How long before the seed time each workspace was created. */
const WORKSPACE_AGE_MS: Record<WorkspaceKind, number> = {
  personal: 90 * DAY_MS,
  team: 30 * DAY_MS,
};

/** One seed schedule (spec §4.5); every seed schedule is blank, with no activities. */
interface SeedSchedule {
  name: string;
  code: string;
  /** Days before the seed time, or `null` for a schedule without a status date. */
  statusDaysBefore: number | null;
  isCurrent: boolean;
  baseline: BaselineFlag;
  updateNumber: number | null;
  notes: string | null;
  /** Days before the seed time the schedule was archived, or `null` when it isn't. */
  archivedDaysAgo: number | null;
}

/** A seed schedule with the tags it doesn't name left at their defaults. */
function seedSchedule(
  name: string,
  code: string,
  statusDaysBefore: number | null,
  tags: Partial<Omit<SeedSchedule, 'name' | 'code' | 'statusDaysBefore'>> = {},
): SeedSchedule {
  return {
    name,
    code,
    statusDaysBefore,
    isCurrent: false,
    baseline: 'none',
    updateNumber: null,
    notes: null,
    archivedDaysAgo: null,
    ...tags,
  };
}

interface SeedProject {
  code: string;
  name: string;
  workspace: WorkspaceKind;
  /** How long before the seed time the project was last updated. */
  updatedMsAgo: number;
  statusDaysBefore: number | null;
  status: ProjectStatus;
  stage: ProjectStage;
  projectType: ProjectType;
  sector: ProjectSector;
  clientName: string;
  city: string | null;
  /** Latitude and longitude, or `null` for a project without coordinates. */
  coordinates: readonly [number, number] | null;
  /**
   * The project's schedules in creation order, with their codes and tags (spec §4.5). A project
   * with schedules has exactly one current schedule, whose status date is the project's (R1, R6).
   */
  schedules: SeedSchedule[];
}

/** Every seed project's country (spec §4.5). */
const SEED_COUNTRY = 'Türkiye';

// The `default` projects in creation order, with their schedules in order.
const DEFAULT_PROJECTS: SeedProject[] = [
  {
    code: '001',
    name: 'Riverside Office Tower',
    workspace: 'personal',
    updatedMsAgo: 3 * MINUTE_MS,
    statusDaysBefore: 2,
    status: 'active',
    stage: 'construction',
    projectType: 'building',
    sector: 'private',
    clientName: 'Riverside Holding',
    city: 'Istanbul',
    coordinates: [41.0151, 28.9795],
    schedules: [seedSchedule('Main schedule', 'MS-01', 2, { isCurrent: true })],
  },
  {
    code: '002',
    name: 'Metro Line Extension',
    workspace: 'personal',
    updatedMsAgo: 2 * DAY_MS,
    statusDaysBefore: null,
    status: 'active',
    stage: 'preconstruction',
    projectType: 'transportation',
    sector: 'public',
    clientName: 'City Transit Office',
    city: 'Ankara',
    coordinates: [39.9334, 32.8597],
    schedules: [],
  },
  {
    code: '003',
    name: 'Harbor Logistics Hub',
    workspace: 'personal',
    updatedMsAgo: 5 * DAY_MS,
    statusDaysBefore: 7,
    status: 'active',
    stage: 'construction',
    projectType: 'industrial',
    sector: 'private',
    clientName: 'Aegean Ports',
    city: 'Izmir',
    coordinates: [38.4192, 27.1287],
    schedules: [
      seedSchedule('Baseline', 'BL-01', 60, { baseline: 'primary' }),
      seedSchedule('Update 1', 'UP-01', 30, { updateNumber: 1 }),
      seedSchedule('Update 2', 'UP-02', 7, {
        isCurrent: true,
        updateNumber: 2,
        notes: 'Includes the revised crane plan.',
      }),
    ],
  },
  {
    code: '004',
    name: 'Campus Library Retrofit',
    workspace: 'personal',
    updatedMsAgo: 21 * DAY_MS,
    statusDaysBefore: 14,
    status: 'on_hold',
    stage: 'construction',
    projectType: 'building',
    sector: 'public',
    clientName: 'Northfield University',
    city: 'Istanbul',
    coordinates: null,
    schedules: [
      seedSchedule('Baseline', 'BL-01', 120, { baseline: 'primary' }),
      seedSchedule('Recovery plan', 'RP-01', 14, {
        isCurrent: true,
        notes: 'Agreed with the client on site.',
      }),
      seedSchedule('Recovery plan draft', 'RP-00', 30, { archivedDaysAgo: 10 }),
    ],
  },
  {
    code: '005',
    name: 'Northgate Bridge Repair',
    workspace: 'personal',
    updatedMsAgo: 35 * DAY_MS,
    statusDaysBefore: null,
    status: 'completed',
    stage: 'completed',
    projectType: 'infrastructure',
    sector: 'public',
    clientName: 'Regional Roads Office',
    city: 'Bursa',
    coordinates: [40.1828, 29.0663],
    schedules: [seedSchedule('Baseline', 'BL-01', null, { isCurrent: true, baseline: 'primary' })],
  },
  {
    code: '006',
    name: 'Old Mill Housing',
    workspace: 'personal',
    updatedMsAgo: 60 * DAY_MS,
    statusDaysBefore: 30,
    status: 'active',
    stage: 'pursuit',
    projectType: 'residential',
    sector: 'private',
    clientName: 'Millstone Homes',
    city: null,
    coordinates: null,
    schedules: [],
  },
  {
    code: 'T-01',
    name: 'Tunnel Ventilation Upgrade',
    workspace: 'team',
    updatedMsAgo: 7 * DAY_MS,
    statusDaysBefore: 3,
    status: 'active',
    stage: 'construction',
    projectType: 'infrastructure',
    sector: 'public',
    clientName: 'Tunnel Operations Agency',
    city: 'Istanbul',
    coordinates: [41.0422, 29.0083],
    schedules: [
      seedSchedule('Baseline rev. 3', 'BL-03', 90, { baseline: 'primary' }),
      seedSchedule('Look-ahead W42', 'LA-42', 3, { isCurrent: true }),
    ],
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

/**
 * A new database for `scenario`; all times and dates count back or forward from `now`. The
 * current user (Deniz) gets `options.teamRole` in Site Operations, which also has an owner of its
 * own (Mert), so it keeps an owner whatever Deniz's role is.
 */
export function seed(scenario: Scenario, now: Date, options: SeedOptions = {}): MockDb {
  const teamRole = options.teamRole ?? 'owner';
  // Timestamps move by exact milliseconds. addDays / subDays keep the wall-clock time instead, so
  // across a daylight-saving change "9 days left" would read 10 and "1 day ago" "23 hours ago".
  const msAgo = (ms: number): ISODateTime => new Date(now.getTime() - ms).toISOString();
  // Status and due dates are local calendar days.
  const daysBefore = (days: number): ISODate => format(subDays(now, days), 'yyyy-MM-dd');
  const daysAfter = (days: number): ISODate => format(addDays(now, days), 'yyyy-MM-dd');

  const deniz = makeUser('Deniz', 'Kaya', 'deniz.kaya@example.com');
  const personal = makeWorkspace('My workspace', 'personal', msAgo(WORKSPACE_AGE_MS.personal));
  const db: MockDb = {
    version: 3,
    scenario,
    teamRole,
    seededAt: now.toISOString(),
    currentUserId: deniz.id,
    session: { userId: deniz.id },
    users: [deniz],
    subscription: {
      plan: 'trial',
      trialEndsAt: new Date(now.getTime() + 9 * DAY_MS).toISOString(),
    },
    workspaces: [personal],
    members: [
      { workspaceId: personal.id, userId: deniz.id, role: 'owner', joinedAt: personal.createdAt },
    ],
    invitations: [],
    projects: [],
    schedules: [],
    shares: [],
    tasks: [],
  };
  if (scenario === 'empty') return db;

  const mert = makeUser('Mert', 'Demir', 'mert.demir@example.com');
  const elif = makeUser('Elif', 'Arslan', 'elif.arslan@example.com');
  const team = makeWorkspace('Site Operations', 'team', msAgo(WORKSPACE_AGE_MS.team));
  db.users.push(mert, elif);
  db.workspaces.push(team);
  db.members.push(
    { workspaceId: team.id, userId: deniz.id, role: teamRole, joinedAt: msAgo(30 * DAY_MS) },
    { workspaceId: team.id, userId: mert.id, role: 'owner', joinedAt: msAgo(20 * DAY_MS) },
    { workspaceId: team.id, userId: elif.id, role: 'viewer', joinedAt: msAgo(10 * DAY_MS) },
  );
  db.invitations.push({
    id: crypto.randomUUID(),
    workspaceId: team.id,
    email: 'site.planner@example.com',
    role: 'editor',
    invitedById: deniz.id,
    invitedAt: msAgo(2 * DAY_MS),
    acceptedAt: null,
    revokedAt: null,
  });

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
      attributes: {
        status: row.status,
        stage: row.stage,
        projectType: row.projectType,
        sector: row.sector,
        startDate: null,
        plannedFinishDate: null,
      },
      client: { name: row.clientName, contactName: null, contactEmail: null },
      location: {
        address: null,
        city: row.city,
        country: SEED_COUNTRY,
        latitude: row.coordinates?.[0] ?? null,
        longitude: row.coordinates?.[1] ?? null,
      },
      // Created 30 days before its last update, but never before its workspace.
      createdAt: msAgo(Math.min(row.updatedMsAgo + 30 * DAY_MS, WORKSPACE_AGE_MS[row.workspace])),
      updatedAt,
    };
    db.projects.push(project);
    for (const schedule of row.schedules) {
      // Created with the project's last update; an archived schedule was last modified when it
      // was archived (R11).
      const archivedAt =
        schedule.archivedDaysAgo === null ? null : msAgo(schedule.archivedDaysAgo * DAY_MS);
      db.schedules.push({
        id: crypto.randomUUID(),
        projectId: project.id,
        name: schedule.name,
        code: schedule.code,
        notes: schedule.notes,
        statusDate:
          schedule.statusDaysBefore === null ? null : daysBefore(schedule.statusDaysBefore),
        source: 'blank',
        sourceFileName: null,
        sourceFormat: null,
        isCurrent: schedule.isCurrent,
        baseline: schedule.baseline,
        updateNumber: schedule.updateNumber,
        archivedAt,
        activityCount: 0,
        hasImportReport: false,
        hasImportMapping: false,
        createdAt: updatedAt,
        updatedAt: archivedAt ?? updatedAt,
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
