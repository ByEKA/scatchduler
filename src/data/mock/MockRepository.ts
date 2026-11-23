import { RepositoryError } from '@/data/errors';
import { withLatency, type LatencyOptions } from '@/data/mock/latency';
import {
  applyArchived,
  applyDetails,
  checkDeleteKeepsCurrent,
  checkNewScheduleCode,
  checkProjectStatusDate,
  compareSchedules,
  currentScheduleOf,
  makeCurrent,
  resolveScheduleSet,
  SCHEDULES_GONE,
  syncProjectStatusDate,
} from '@/data/mock/schedule-rules';
import type { MockDb, MockInvitation, MockMember, MockSchedule } from '@/data/mock/seed';
import type { MockStore } from '@/data/mock/store';
import type {
  CopyScheduleInput,
  DataRepository,
  ImportScheduleInput,
  MaterializeScheduleInput,
  NewProjectInput,
  NewScheduleInput,
  NewTeamWorkspaceInput,
  SaveScheduleDocumentInput,
  UpdateProjectInput,
  UpdateScheduleDetailsInput,
} from '@/data/repository';
import {
  countScheduleActivities,
  decodeScheduleDocument,
  ScheduleCodecError,
  scheduleDataPath,
} from '@/data/schedule-codec';
import type { ScheduleDocument } from '@/data/schedule-types';
import {
  compareIds,
  compareMembers,
  compareNamed,
  compareWorkspaces,
  newestFirst,
} from '@/data/sort';
import {
  LOCK_TTL_MS,
  type Folder,
  type ID,
  type ISODateTime,
  type ImportFormat,
  type ImportMapping,
  type ImportReport,
  type InviteResult,
  type LibraryData,
  type Program,
  type Project,
  type ProjectAttributes,
  type ProjectClient,
  type ProjectLocation,
  type ProjectSector,
  type ProjectStage,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectType,
  type Role,
  type Schedule,
  type ScheduleLock,
  type ScheduleSource,
  type SharedScheduleRow,
  type Subscription,
  type Task,
  type User,
  type Workspace,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceSummary,
} from '@/data/types';

export interface MockRepositoryOptions {
  store: MockStore;
  /** Delay before every call; `0` by default. */
  latencyMs?: number;
  /** From 0 to 1: the share of reads that fail with a simulated network error; `0` by default. */
  failRate?: number;
  /** Returns a number in [0, 1); `Math.random` by default. */
  random?: () => number;
  /** Clock for `createdAt` and `updatedAt`; `new Date()` by default. */
  now?: () => Date;
}

const time = (value: ISODateTime): number => Date.parse(value);

/**
 * The form two project IDs are compared in: trimmed and lower-cased. `toLowerCase`, not
 * `toLocaleLowerCase`: under a Turkish locale `'I'` lower-cases to a dotless `'ı'`.
 */
const codeKey = (code: string): string => code.trim().toLowerCase();

/** The trimmed text, or `null` when nothing is left. */
function optionalText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function unknownError(message: string, cause: unknown): RepositoryError {
  const error = new RepositoryError('unknown', message);
  error.cause = cause;
  return error;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const fail = () => {
      reject(unknownError('Could not read the cover image', reader.error));
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else fail();
    };
    reader.onerror = fail;
    reader.onabort = fail;
    reader.readAsDataURL(file);
  });
}

/** The project with its schedule counts (archived schedules counted apart), program name and current schedule. */
function projectSummary(db: MockDb, project: Project): ProjectSummary {
  const schedules = db.schedules.filter((schedule) => schedule.projectId === project.id);
  const current = currentScheduleOf(schedules, project.id);
  const program =
    project.programId === null
      ? undefined
      : db.programs.find((item) => item.id === project.programId);
  return {
    ...project,
    programName: program?.name ?? null,
    scheduleCount: schedules.filter((schedule) => schedule.archivedAt === null).length,
    totalScheduleCount: schedules.length,
    currentSchedule: current ? { id: current.id, name: current.name } : null,
  };
}

/** The workspace's projects, latest `updatedAt` first (ties by id), with their schedule counts. */
function projectSummaries(db: MockDb, workspaceId: ID): ProjectSummary[] {
  return db.projects
    .filter((project) => project.workspaceId === workspaceId)
    .sort(newestFirst((project) => project.updatedAt))
    .map((project) => projectSummary(db, project));
}

/** Due date ascending with undated tasks last, then oldest first, then by id. */
function comparePendingTasks(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    // 'YYYY-MM-DD' strings sort in calendar order, so date-only values are never parsed here.
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return time(a.createdAt) - time(b.createdAt) || compareIds(a.id, b.id);
}

// Roles and members (P2 spec §6.4). The database enforces the same rules (RLS, the member
// functions and the invitations Edge Function); the checks below run in the order those use.

/** Role levels as the database compares them (P2 spec §6.6: owner 3 · editor 2 · viewer 1). */
const ROLE_LEVEL: Record<Role, number> = { owner: 3, editor: 2, viewer: 1 };

const NO_PERMISSION = "You don't have permission to do that.";
const PROJECT_NOT_FOUND = 'Project not found';
const PROJECT_CODE_TAKEN = 'This ID is already used in this workspace';

// The values the `projects` check constraints allow (P3 core spec §4.6).
const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'on_hold', 'completed', 'cancelled'];
const PROJECT_STAGES: readonly ProjectStage[] = [
  'pursuit',
  'preconstruction',
  'construction',
  'closeout',
  'completed',
];
const PROJECT_TYPES: readonly ProjectType[] = [
  'building',
  'residential',
  'infrastructure',
  'industrial',
  'energy',
  'transportation',
  'water',
  'other',
];
const PROJECT_SECTORS: readonly ProjectSector[] = ['public', 'private', 'public_private'];

/** Supabase's copy for a plain check violation (P2 spec §8.4). */
const INVALID_VALUES = "Some values aren't valid. Check the form and try again.";

const isOneOf = (list: readonly string[], value: unknown): boolean =>
  typeof value === 'string' && list.includes(value);

const isInRange = (value: number, limit: number): boolean =>
  Number.isFinite(value) && value >= -limit && value <= limit;

/**
 * The `projects` check constraints, run by `createProject` and `updateProject` after the role
 * check: status, stage, type and sector from their lists, and coordinates set together and in
 * range. Anything else is 'validation' with the plain check copy, as the database answers.
 */
function checkProjectValues(attributes: ProjectAttributes, location: ProjectLocation): void {
  const { latitude, longitude } = location;
  const valid =
    isOneOf(PROJECT_STATUSES, attributes.status) &&
    (attributes.stage === null || isOneOf(PROJECT_STAGES, attributes.stage)) &&
    (attributes.projectType === null || isOneOf(PROJECT_TYPES, attributes.projectType)) &&
    (attributes.sector === null || isOneOf(PROJECT_SECTORS, attributes.sector)) &&
    (latitude === null) === (longitude === null) &&
    (latitude === null || isInRange(latitude, 90)) &&
    (longitude === null || isInRange(longitude, 180));
  if (!valid) throw new RepositoryError('validation', INVALID_VALUES);
}

/**
 * A coordinate as `numeric(8,6)` and `numeric(9,6)` store it: rounded to six decimals. `+ 0`
 * turns a rounded `-0` into `0`, as the database returns it.
 */
function roundCoordinate(value: number | null): number | null {
  return value === null ? null : Number(value.toFixed(6)) + 0;
}

/** The stored client: text trimmed, empty text `null`. */
function storedClient(client: ProjectClient): ProjectClient {
  return {
    name: optionalText(client.name),
    contactName: optionalText(client.contactName),
    contactEmail: optionalText(client.contactEmail),
  };
}

/** The stored attributes: empty dates `null`. */
function storedAttributes(attributes: ProjectAttributes): ProjectAttributes {
  return {
    status: attributes.status,
    stage: attributes.stage,
    projectType: attributes.projectType,
    sector: attributes.sector,
    startDate: optionalText(attributes.startDate),
    plannedFinishDate: optionalText(attributes.plannedFinishDate),
  };
}

/** The stored location: text trimmed, empty text `null`, coordinates rounded. */
function storedLocation(location: ProjectLocation): ProjectLocation {
  return {
    address: optionalText(location.address),
    city: optionalText(location.city),
    country: optionalText(location.country),
    latitude: roundCoordinate(location.latitude),
    longitude: roundCoordinate(location.longitude),
  };
}

const SCHEDULE_NOT_FOUND = 'Schedule not found';
const NO_ORIGINAL_FILE = 'This schedule has no original file.';
const ORIGINAL_FILE_GONE = "The original file isn't available in demo mode after a reload.";

/** The issues a stored report keeps in the mock, so twenty imports fit `localStorage` (D22). */
const STORED_REPORT_ISSUES = 50;

// The `schedules` check constraints on an import (spec §4.6, §5.10, D67).
const MAX_SOURCE_FILE_SIZE = 52_428_800;
const MAX_ACTIVITY_COUNT = 50_000;

const ARCHIVED_EDIT_COPY = 'Restore this schedule before editing it.';
const LOCK_EXPIRED_COPY = 'Your edit lock expired. Copy your changes or reload the schedule.';
const REVISION_CONFLICT_COPY = 'This schedule was changed elsewhere. Reload and try again.';

function activeLock(lock: ScheduleLock | null, nowMs: number): ScheduleLock | null {
  if (lock === null) return null;
  return Date.parse(lock.expiresAt) > nowMs ? lock : null;
}

function lockHolderActive(
  schedule: MockSchedule,
  callerId: ID,
  nowMs: number,
): ScheduleLock | null {
  const lock = activeLock(schedule.lock ?? null, nowMs);
  if (lock === null || lock.userId === callerId) return null;
  return lock;
}

function displayNameOf(db: MockDb, userId: ID): string {
  const user = db.users.find((u) => u.id === userId);
  if (!user) return 'Another user';
  const full = `${user.firstName} ${user.lastName}`.trim();
  return full !== '' ? full : user.email || 'Another user';
}

/**
 * A stored schedule as the repository returns it: `hasImportReport`, `hasImportMapping`,
 * `hasScheduleData` and expired-lock filtering mirror `schedule_items`.
 */
function toSchedule(schedule: MockSchedule, nowMs: number): Schedule {
  return {
    id: schedule.id,
    projectId: schedule.projectId,
    folderId: schedule.folderId ?? null,
    copiedFromId: schedule.copiedFromId ?? null,
    name: schedule.name,
    code: schedule.code,
    notes: schedule.notes,
    statusDate: schedule.statusDate,
    source: schedule.source,
    sourceFileName: schedule.sourceFileName,
    sourceFormat: schedule.sourceFormat,
    isCurrent: schedule.isCurrent,
    baseline: schedule.baseline,
    updateNumber: schedule.updateNumber,
    archivedAt: schedule.archivedAt,
    activityCount: schedule.activityCount,
    hasImportReport: (schedule.importReport ?? null) !== null,
    hasImportMapping: (schedule.importMapping ?? null) !== null,
    lock: activeLock(schedule.lock ?? null, nowMs),
    dataRevision: schedule.dataRevision ?? 0,
    hasScheduleData: (schedule.dataFilePath ?? null) !== null,
    calculationMode: schedule.calculationMode ?? 'calculated',
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}

/** The import fields a new schedule stores (blank schedules: `null`). */
interface ImportDetails {
  sourceFileName: string;
  sourceFormat: ImportFormat;
  /** `null` takes the project's status date, as the database's insert trigger does. */
  statusDate: Schedule['statusDate'];
  activityCount: number;
  sourceProjectCode: string | null;
  importReport: ImportReport;
  importMapping: ImportMapping;
}

/**
 * What an import stores (spec §4.5): the report's format, the activity count, the status date,
 * the source project code, the mapping, and the report with its first 50 issues. The database's
 * column checks refuse a file outside 1 byte to 50 MB and an activity count outside 0 to 50,000,
 * with the plain check copy.
 */
function importDetails(input: ImportScheduleInput): ImportDetails {
  const { file, report, activityCount } = input;
  const valid =
    file.size >= 1 &&
    file.size <= MAX_SOURCE_FILE_SIZE &&
    Number.isInteger(activityCount) &&
    activityCount >= 0 &&
    activityCount <= MAX_ACTIVITY_COUNT;
  if (!valid) throw new RepositoryError('validation', INVALID_VALUES);
  return {
    sourceFileName: file.name,
    sourceFormat: report.format,
    statusDate: input.statusDate,
    activityCount,
    sourceProjectCode: input.sourceProjectCode,
    importReport: { ...report, issues: report.issues.slice(0, STORED_REPORT_ISSUES) },
    importMapping: input.mapping,
  };
}

/** An invitable email after trimming and lowercasing; the Edge Function checks the same shape. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form emails are stored and matched in. `toLowerCase`, not the locale-aware version. */
const emailKey = (email: string): string => email.trim().toLowerCase();

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && Object.hasOwn(ROLE_LEVEL, value);

const isPending = (invitation: MockInvitation): boolean =>
  invitation.acceptedAt === null && invitation.revokedAt === null;

/** The user's role in the workspace, or `null` when they aren't a member of it. */
function roleOf(db: MockDb, workspaceId: ID, userId: ID): Role | null {
  return db.members.find((m) => m.workspaceId === workspaceId && m.userId === userId)?.role ?? null;
}

/** True when the current user has `minRole` or a higher role in the workspace. */
function hasRole(db: MockDb, workspaceId: ID, minRole: Role): boolean {
  const role = roleOf(db, workspaceId, db.currentUserId);
  return role !== null && ROLE_LEVEL[role] >= ROLE_LEVEL[minRole];
}

/** The membership an owner is about to change or remove; rejects as the member functions do. */
function memberToChange(db: MockDb, workspaceId: ID, userId: ID): MockMember {
  if (!hasRole(db, workspaceId, 'owner')) {
    throw new RepositoryError('forbidden', 'Only workspace owners can change members.');
  }
  const member = db.members.find((m) => m.workspaceId === workspaceId && m.userId === userId);
  if (!member) throw new RepositoryError('validation', 'This person is no longer a member.');
  return member;
}

/** Run after a member change, inside the same write: throwing there drops the change. */
function assertOwnerRemains(db: MockDb, workspaceId: ID): void {
  if (!db.members.some((m) => m.workspaceId === workspaceId && m.role === 'owner')) {
    throw new RepositoryError('validation', 'A workspace needs at least one owner.');
  }
}

/** `DataRepository` over the mock store (spec §5.6, P2 spec §6.4), signed in as `currentUserId`. */
export class MockRepository implements DataRepository {
  private readonly store: MockStore;
  private readonly latencyMs: number;
  private readonly failRate: number;
  private readonly random: () => number;
  private readonly now: () => Date;
  /**
   * The imported originals by schedule id (spec §4.5, D22). They live in memory only: the store
   * can't hold files, so after a reload `getScheduleSourceFile` can't give them back.
   */
  private readonly originals = new Map<ID, File>();

  constructor(options: MockRepositoryOptions) {
    this.store = options.store;
    this.latencyMs = options.latencyMs ?? 0;
    this.failRate = options.failRate ?? 0;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
  }

  getCurrentUser(): Promise<User> {
    return this.run('read', () => {
      const db = this.store.read();
      const user = db.users.find((u) => u.id === db.currentUserId);
      if (!user) throw new RepositoryError('not_found', 'User not found');
      return user;
    });
  }

  getSubscription(): Promise<Subscription> {
    return this.run('read', () => this.store.read().subscription);
  }

  listWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.run('read', () => {
      const db = this.store.read();
      // Only the workspaces the current user is a member of, each with their role in it.
      return db.workspaces
        .flatMap((workspace): WorkspaceSummary[] => {
          const myRole = roleOf(db, workspace.id, db.currentUserId);
          if (myRole === null) return [];
          const projectCount = db.projects.filter((p) => p.workspaceId === workspace.id).length;
          return [{ ...workspace, projectCount, myRole }];
        })
        .sort(compareWorkspaces);
    });
  }

  createTeamWorkspace(input: NewTeamWorkspaceInput): Promise<Workspace> {
    return this.run('write', () =>
      this.commit((db) => {
        const timestamp = this.now().toISOString();
        const workspace: Workspace = {
          id: crypto.randomUUID(),
          name: input.name.trim(),
          kind: 'team',
          createdAt: timestamp,
        };
        db.workspaces.push(workspace);
        // The creator owns it; without the membership it would never be listed.
        db.members.push({
          workspaceId: workspace.id,
          userId: db.currentUserId,
          role: 'owner',
          joinedAt: timestamp,
        });
        return workspace;
      }),
    );
  }

  listPrograms(workspaceId: ID): Promise<Program[]> {
    return this.run('read', () => {
      const db = this.store.read();
      if (!hasRole(db, workspaceId, 'viewer')) return [];
      return db.programs.filter((pr) => pr.workspaceId === workspaceId).sort(compareNamed);
    });
  }

  createProgram(input: { workspaceId: ID; name: string }): Promise<Program> {
    return this.run('write', () => {
      const timestamp = this.now().toISOString();
      return this.commit((db) => {
        if (!hasRole(db, input.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const trimmed = input.name.trim();
        if (trimmed === '') {
          throw new RepositoryError('validation', 'Enter a program name.');
        }
        if (trimmed.length > 80) {
          throw new RepositoryError('validation', 'Use 80 characters or fewer.');
        }
        const key = codeKey(trimmed);
        if (
          db.programs.some(
            (pr) => pr.workspaceId === input.workspaceId && codeKey(pr.name) === key,
          )
        ) {
          throw new RepositoryError('conflict', 'A program with this name already exists.');
        }
        const program: Program = {
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          name: trimmed,
          createdAt: timestamp,
        };
        db.programs.push(program);
        return program;
      });
    });
  }

  renameProgram(input: { programId: ID; name: string }): Promise<Program> {
    return this.run('write', () =>
      this.commit((db) => {
        const program = db.programs.find((pr) => pr.id === input.programId);
        if (!program || !hasRole(db, program.workspaceId, 'viewer')) {
          throw new RepositoryError('not_found', 'Program not found');
        }
        if (!hasRole(db, program.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const trimmed = input.name.trim();
        if (trimmed === '') {
          throw new RepositoryError('validation', 'Enter a program name.');
        }
        if (trimmed.length > 80) {
          throw new RepositoryError('validation', 'Use 80 characters or fewer.');
        }
        const key = codeKey(trimmed);
        if (
          db.programs.some(
            (pr) =>
              pr.id !== program.id &&
              pr.workspaceId === program.workspaceId &&
              codeKey(pr.name) === key,
          )
        ) {
          throw new RepositoryError('conflict', 'A program with this name already exists.');
        }
        program.name = trimmed;
        return program;
      }),
    );
  }

  deleteProgram(programId: ID): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const program = db.programs.find((pr) => pr.id === programId);
        if (!program || !hasRole(db, program.workspaceId, 'viewer')) {
          throw new RepositoryError('not_found', 'Program not found');
        }
        if (!hasRole(db, program.workspaceId, 'owner')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        db.programs = db.programs.filter((pr) => pr.id !== program.id);
        // R1: deleting a program clears programId on its projects without changing updatedAt.
        for (const project of db.projects) {
          if (project.programId === program.id) project.programId = null;
        }
      });
    });
  }

  listProjects(workspaceId: ID): Promise<ProjectSummary[]> {
    return this.run('read', () => projectSummaries(this.store.read(), workspaceId));
  }

  listRecentProjects(workspaceId: ID, limit: number): Promise<ProjectSummary[]> {
    return this.run('read', () =>
      projectSummaries(this.store.read(), workspaceId).slice(0, Math.max(0, limit)),
    );
  }

  isProjectCodeAvailable(workspaceId: ID, code: string): Promise<boolean> {
    return this.run('read', () => {
      const key = codeKey(code);
      return !this.store
        .read()
        .projects.some((p) => p.workspaceId === workspaceId && codeKey(p.code) === key);
    });
  }

  createProject(input: NewProjectInput): Promise<Project> {
    return this.run('write', async () => {
      // The image is read first. The checks (workspace, role, then ID) and the insert below run in
      // one synchronous write, so two overlapping calls with the same ID cannot both pass.
      const coverImageUrl = input.coverImage ? await readAsDataUrl(input.coverImage) : null;
      const timestamp = this.now().toISOString();
      return this.commit((db) => {
        const code = input.code.trim();
        if (!db.workspaces.some((w) => w.id === input.workspaceId)) {
          throw new RepositoryError('not_found', 'Workspace not found');
        }
        if (!hasRole(db, input.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const programId = input.programId ?? null;
        if (
          programId !== null &&
          !db.programs.some((pr) => pr.id === programId && pr.workspaceId === input.workspaceId)
        ) {
          throw new RepositoryError('validation', 'Choose a program in this workspace.');
        }
        checkProjectValues(input.attributes, input.location);
        const key = codeKey(code);
        if (
          db.projects.some((p) => p.workspaceId === input.workspaceId && codeKey(p.code) === key)
        ) {
          throw new RepositoryError('conflict', PROJECT_CODE_TAKEN);
        }
        const project: Project = {
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          programId,
          code,
          name: input.name.trim(),
          description: optionalText(input.description),
          coverImageUrl,
          statusDate: optionalText(input.statusDate),
          attributes: storedAttributes(input.attributes),
          client: storedClient(input.client),
          location: storedLocation(input.location),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        db.projects.push(project);
        return project;
      });
    });
  }

  getProject(projectId: ID): Promise<ProjectSummary> {
    return this.run('read', () => {
      // No membership filter: the mock holds no project the user can't see (spec D34).
      const db = this.store.read();
      const project = db.projects.find((p) => p.id === projectId);
      if (!project) throw new RepositoryError('not_found', PROJECT_NOT_FOUND);
      return projectSummary(db, project);
    });
  }

  updateProject(input: UpdateProjectInput): Promise<Project> {
    return this.run('write', async () => {
      // As in createProject: a new cover is read first; the checks (project, role, values, then
      // ID) and the write run in one synchronous store write.
      const newCoverUrl = input.cover instanceof File ? await readAsDataUrl(input.cover) : null;
      const timestamp = this.now().toISOString();
      return this.commit((db) => {
        const project = db.projects.find((p) => p.id === input.projectId);
        if (!project) throw new RepositoryError('not_found', PROJECT_NOT_FOUND);
        if (!hasRole(db, project.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        // Left out, the status date stays as it is; given, it must be the current schedule's
        // (R6). The database's guard trigger runs before the column checks, so this comes first.
        const statusDate =
          input.statusDate === undefined ? undefined : optionalText(input.statusDate);
        if (statusDate !== undefined) checkProjectStatusDate(project, db.schedules, statusDate);
        if (input.programId !== undefined) {
          if (
            input.programId !== null &&
            !db.programs.some(
              (pr) => pr.id === input.programId && pr.workspaceId === project.workspaceId,
            )
          ) {
            throw new RepositoryError('validation', 'Choose a program in this workspace.');
          }
        }
        checkProjectValues(input.attributes, input.location);
        const code = input.code.trim();
        const key = codeKey(code);
        if (
          db.projects.some(
            (p) =>
              p.id !== project.id &&
              p.workspaceId === project.workspaceId &&
              codeKey(p.code) === key,
          )
        ) {
          throw new RepositoryError('conflict', PROJECT_CODE_TAKEN);
        }
        project.code = code;
        project.name = input.name.trim();
        project.description = optionalText(input.description);
        if (input.programId !== undefined) project.programId = input.programId;
        if (input.cover !== 'keep') project.coverImageUrl = newCoverUrl;
        if (statusDate !== undefined) project.statusDate = statusDate;
        project.attributes = storedAttributes(input.attributes);
        project.client = storedClient(input.client);
        project.location = storedLocation(input.location);
        project.updatedAt = timestamp;
        return project;
      });
    });
  }

  deleteProject(projectId: ID): Promise<void> {
    return this.run('write', () => {
      // One store write, as the database's single transaction (R12): the project, its folders, its
      // schedules and their shares go; its tasks stay without a project (`on delete set null`).
      // Their originals and snapshots go afterwards, as the Supabase adapter removes the stored objects.
      const deleted = this.commit((db) => {
        const project = db.projects.find((p) => p.id === projectId);
        if (!project) throw new RepositoryError('not_found', PROJECT_NOT_FOUND);
        if (!hasRole(db, project.workspaceId, 'owner')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const doomed = db.schedules.filter((s) => s.projectId === project.id);
        const scheduleIds = new Set(doomed.map((s) => s.id));
        const snapshotPaths = doomed
          .map((s) => s.dataFilePath)
          .filter((p): p is string => p !== null);
        db.shares = db.shares.filter((share) => !scheduleIds.has(share.scheduleId));
        db.schedules = db.schedules.filter((s) => !scheduleIds.has(s.id));
        db.folders = db.folders.filter((f) => f.projectId !== project.id);
        db.projects = db.projects.filter((p) => p !== project);
        for (const task of db.tasks) {
          if (task.projectId === project.id) task.projectId = null;
        }
        return { scheduleIds, snapshotPaths };
      });
      for (const id of deleted.scheduleIds) this.originals.delete(id);
      for (const path of deleted.snapshotPaths) this.store.removeSnapshot(path);
    });
  }

  listFolders(projectId: ID): Promise<Folder[]> {
    return this.run('read', () => {
      const db = this.store.read();
      const project = db.projects.find((p) => p.id === projectId);
      if (!project || !hasRole(db, project.workspaceId, 'viewer')) return [];
      return db.folders.filter((f) => f.projectId === projectId).sort(compareNamed);
    });
  }

  createFolder(input: { projectId: ID; parentId?: ID | null; name: string }): Promise<Folder> {
    return this.run('write', () => {
      const timestamp = this.now().toISOString();
      return this.commit((db) => {
        const project = db.projects.find((p) => p.id === input.projectId);
        if (!project || !hasRole(db, project.workspaceId, 'viewer')) {
          throw new RepositoryError('not_found', PROJECT_NOT_FOUND);
        }
        if (!hasRole(db, project.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const trimmed = input.name.trim();
        if (trimmed === '') {
          throw new RepositoryError('validation', 'Enter a folder name.');
        }
        if (trimmed.length > 80) {
          throw new RepositoryError('validation', 'Use 80 characters or fewer.');
        }
        const parentId = input.parentId ?? null;
        let cur = parentId;
        let depth = 1;
        while (cur !== null) {
          const parent = db.folders.find((f) => f.id === cur);
          if (!parent || parent.projectId !== project.id) {
            throw new RepositoryError('validation', 'Choose a folder in this project.');
          }
          depth += 1;
          if (depth > 3) {
            throw new RepositoryError('validation', 'Folders can be nested up to 3 levels deep.');
          }
          cur = parent.parentId;
        }
        const key = codeKey(trimmed);
        if (
          db.folders.some(
            (f) =>
              f.projectId === project.id && f.parentId === parentId && codeKey(f.name) === key,
          )
        ) {
          throw new RepositoryError('conflict', 'A folder with this name already exists here.');
        }
        const folder: Folder = {
          id: crypto.randomUUID(),
          projectId: project.id,
          parentId,
          name: trimmed,
          createdAt: timestamp,
        };
        db.folders.push(folder);
        return folder;
      });
    });
  }

  renameFolder(input: { folderId: ID; name: string }): Promise<Folder> {
    return this.run('write', () =>
      this.commit((db) => {
        const folder = db.folders.find((f) => f.id === input.folderId);
        const project = db.projects.find((p) => p.id === folder?.projectId);
        if (!folder || !project || !hasRole(db, project.workspaceId, 'viewer')) {
          throw new RepositoryError('not_found', 'Folder not found');
        }
        if (!hasRole(db, project.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const trimmed = input.name.trim();
        if (trimmed === '') {
          throw new RepositoryError('validation', 'Enter a folder name.');
        }
        if (trimmed.length > 80) {
          throw new RepositoryError('validation', 'Use 80 characters or fewer.');
        }
        const key = codeKey(trimmed);
        if (
          db.folders.some(
            (f) =>
              f.id !== folder.id &&
              f.projectId === folder.projectId &&
              f.parentId === folder.parentId &&
              codeKey(f.name) === key,
          )
        ) {
          throw new RepositoryError('conflict', 'A folder with this name already exists here.');
        }
        folder.name = trimmed;
        return folder;
      }),
    );
  }

  deleteFolder(folderId: ID): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const folder = db.folders.find((f) => f.id === folderId);
        const project = db.projects.find((p) => p.id === folder?.projectId);
        if (!folder || !project || !hasRole(db, project.workspaceId, 'viewer')) {
          throw new RepositoryError('not_found', 'Folder not found');
        }
        if (!hasRole(db, project.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        // R4: re-parent child folders and schedules to the deleted folder's parentId without changing updatedAt.
        for (const child of db.folders) {
          if (child.parentId === folder.id) child.parentId = folder.parentId;
        }
        for (const schedule of db.schedules) {
          if (schedule.folderId === folder.id) schedule.folderId = folder.parentId;
        }
        db.folders = db.folders.filter((f) => f.id !== folder.id);
      });
    });
  }

  moveSchedulesToFolder(input: { scheduleIds: ID[]; folderId: ID | null }): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const set = this.scheduleSetFor(db, input.scheduleIds, 'editor');
        if (!set) return;
        if (
          input.folderId !== null &&
          !db.folders.some((f) => f.id === input.folderId && f.projectId === set.projectId)
        ) {
          throw new RepositoryError('validation', 'Choose a folder in this project.');
        }
        for (const schedule of set.found) {
          schedule.folderId = input.folderId;
        }
      });
    });
  }

  createSchedule(input: NewScheduleInput): Promise<Schedule> {
    return this.run('write', () => this.addSchedule(input, null).schedule);
  }

  importSchedule(input: ImportScheduleInput): Promise<Schedule> {
    return this.run('write', async () => {
      let document: ScheduleDocument;
      try {
        document = await decodeScheduleDocument(input.dataStored);
      } catch (error) {
        if (error instanceof ScheduleCodecError) {
          throw new RepositoryError('validation', error.message);
        }
        throw error;
      }
      const { schedule, dataFilePath } = this.addSchedule(input, input);
      this.originals.set(schedule.id, input.file);
      if (dataFilePath !== null) {
        this.store.writeSnapshot(dataFilePath, document);
      }
      return schedule;
    });
  }

  copySchedule(input: CopyScheduleInput): Promise<Schedule> {
    return this.run('write', () => {
      const nowDate = this.now();
      const timestamp = nowDate.toISOString();
      const nowMs = nowDate.getTime();
      const result = this.commit((db) => {
        const source = db.schedules.find((s) => s.id === input.scheduleId);
        const project = db.projects.find((p) => p.id === source?.projectId);
        if (!source || !project || !hasRole(db, project.workspaceId, 'viewer')) {
          throw new RepositoryError('not_found', SCHEDULE_NOT_FOUND);
        }
        if (!hasRole(db, project.workspaceId, 'editor')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const name = input.name.trim();
        if (name === '') {
          throw new RepositoryError('validation', 'Enter a schedule name.');
        }
        if (name.length > 120) {
          throw new RepositoryError('validation', 'Use 120 characters or fewer.');
        }
        const code = checkNewScheduleCode(db.schedules, project.id, input.code);
        const folderId = input.folderId === undefined ? source.folderId : input.folderId;
        if (
          folderId !== null &&
          !db.folders.some((f) => f.id === folderId && f.projectId === project.id)
        ) {
          throw new RepositoryError('validation', 'Choose a folder in this project.');
        }
        const newScheduleId = crypto.randomUUID();
        const newDataFilePath =
          source.dataFilePath === null
            ? null
            : scheduleDataPath(project.workspaceId, project.id, newScheduleId);
        const copy: MockSchedule = {
          id: newScheduleId,
          projectId: project.id,
          folderId,
          copiedFromId: source.id,
          name,
          code,
          notes: source.notes,
          statusDate: source.statusDate,
          source: source.source,
          sourceFileName: source.sourceFileName,
          sourceFormat: source.sourceFormat,
          isCurrent: false,
          baseline: 'none',
          updateNumber: null,
          archivedAt: null,
          activityCount: source.activityCount,
          sourceProjectCode: source.sourceProjectCode,
          importReport: source.importReport,
          importMapping: source.importMapping,
          lock: null,
          dataRevision: newDataFilePath === null ? 0 : 1,
          dataFilePath: newDataFilePath,
          calculationMode: source.calculationMode,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        db.schedules.push(copy);
        project.updatedAt = timestamp;
        return {
          schedule: toSchedule(copy, nowMs),
          sourceId: source.id,
          sourceDataFilePath: source.dataFilePath,
          newDataFilePath,
        };
      });
      if (result.sourceDataFilePath !== null && result.newDataFilePath !== null) {
        const snapshot = this.store.readSnapshot(result.sourceDataFilePath);
        if (snapshot !== null) {
          this.store.writeSnapshot(result.newDataFilePath, snapshot);
        }
      }
      const originalFile = this.originals.get(result.sourceId);
      if (originalFile !== undefined) {
        this.originals.set(result.schedule.id, originalFile);
      }
      return result.schedule;
    });
  }

  listSchedules(projectId: ID): Promise<Schedule[]> {
    return this.run('read', () => {
      const nowMs = this.now().getTime();
      // No membership filter, as in getProject (spec D34).
      return this.store
        .read()
        .schedules.filter((schedule) => schedule.projectId === projectId)
        .sort(compareSchedules)
        .map((schedule) => toSchedule(schedule, nowMs));
    });
  }

  updateScheduleDetails(input: UpdateScheduleDetailsInput): Promise<Schedule> {
    return this.run('write', () => {
      const nowDate = this.now();
      const timestamp = nowDate.toISOString();
      const nowMs = nowDate.getTime();
      return this.commit((db) => {
        const project = this.editableProjectOf(db, input.scheduleId);
        const existing = db.schedules.find((s) => s.id === input.scheduleId);
        if (existing) {
          const nextStatusDate = optionalText(input.statusDate);
          if (nextStatusDate !== existing.statusDate) {
            const blocker = lockHolderActive(existing, db.currentUserId, nowMs);
            if (blocker !== null) {
              throw new RepositoryError(
                'conflict',
                `This schedule is being edited by ${blocker.userName}. Try again once they finish.`,
              );
            }
          }
        }
        const schedule = applyDetails(db.schedules, input, timestamp);
        syncProjectStatusDate(project, db.schedules);
        return toSchedule(schedule, nowMs);
      });
    });
  }

  setCurrentSchedule(scheduleId: ID): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const project = this.editableProjectOf(db, scheduleId);
        makeCurrent(db.schedules, scheduleId);
        syncProjectStatusDate(project, db.schedules);
      });
    });
  }

  setSchedulesArchived(input: { scheduleIds: ID[]; archived: boolean }): Promise<void> {
    return this.run('write', () => {
      const nowDate = this.now();
      const timestamp = nowDate.toISOString();
      const nowMs = nowDate.getTime();
      this.commit((db) => {
        const set = this.scheduleSetFor(db, input.scheduleIds, 'editor');
        if (!set) return;
        if (input.archived) {
          for (const schedule of set.found) {
            const blocker = lockHolderActive(schedule, db.currentUserId, nowMs);
            if (blocker !== null) {
              throw new RepositoryError(
                'conflict',
                `This schedule is being edited by ${blocker.userName}. Try again once they finish.`,
              );
            }
          }
        }
        applyArchived(set.found, input.archived, timestamp);
      });
    });
  }

  deleteSchedules(scheduleIds: ID[]): Promise<void> {
    return this.run('write', () => {
      // One store write, as the database's single statement: R3 is checked on the state the
      // whole delete leaves, then the schedules and their shares go; originals and snapshots after.
      const deleted = this.commit((db) => {
        const set = this.scheduleSetFor(db, scheduleIds, 'owner');
        if (!set) return { ids: [] as ID[], snapshotPaths: [] as string[] };
        const ids = set.found.map((s) => s.id);
        const snapshotPaths = set.found
          .map((s) => s.dataFilePath)
          .filter((p): p is string => p !== null);
        checkDeleteKeepsCurrent(db.schedules, set.projectId, ids);
        const gone = new Set(ids);
        db.shares = db.shares.filter((share) => !gone.has(share.scheduleId));
        db.schedules = db.schedules.filter((s) => !gone.has(s.id));
        return { ids, snapshotPaths };
      });
      for (const id of deleted.ids) this.originals.delete(id);
      for (const path of deleted.snapshotPaths) this.store.removeSnapshot(path);
    });
  }

  getImportReport(scheduleId: ID): Promise<ImportReport | null> {
    return this.run('read', () => this.storedSchedule(scheduleId).importReport ?? null);
  }

  getImportMapping(scheduleId: ID): Promise<ImportMapping | null> {
    return this.run('read', () => this.storedSchedule(scheduleId).importMapping ?? null);
  }

  getScheduleSourceFile(scheduleId: ID): Promise<File> {
    return this.run('read', () => {
      const schedule = this.storedSchedule(scheduleId);
      if (schedule.source !== 'import') throw new RepositoryError('validation', NO_ORIGINAL_FILE);
      const file = this.originals.get(schedule.id);
      if (!file) throw new RepositoryError('validation', ORIGINAL_FILE_GONE);
      return file;
    });
  }

  getScheduleDocument(
    scheduleId: ID,
  ): Promise<{ document: ScheduleDocument | null; dataRevision: number }> {
    return this.run('read', () => {
      const schedule = this.storedSchedule(scheduleId);
      if (schedule.dataFilePath === null) {
        return { document: null, dataRevision: 0 };
      }
      const document = this.store.readSnapshot(schedule.dataFilePath);
      return { document, dataRevision: schedule.dataRevision };
    });
  }

  materializeScheduleDocument(input: MaterializeScheduleInput): Promise<{ dataRevision: number }> {
    return this.run('write', () => {
      const result = this.commit((db) => {
        const { schedule, project } = this.scheduleForWrite(db, input.scheduleId, 'editor');
        if (schedule.dataFilePath !== null) {
          return { dataRevision: schedule.dataRevision, newPath: null as string | null };
        }
        const activityCount = countScheduleActivities(input.document);
        if (activityCount > MAX_ACTIVITY_COUNT) {
          throw new RepositoryError('validation', INVALID_VALUES);
        }
        const newPath = scheduleDataPath(project.workspaceId, project.id, schedule.id);
        schedule.dataFilePath = newPath;
        schedule.dataRevision = 1;
        schedule.activityCount = activityCount;
        schedule.calculationMode = input.document.settings.displayMode;
        // R7: updatedAt stays unchanged.
        return { dataRevision: 1, newPath };
      });
      if (result.newPath !== null) {
        this.store.writeSnapshot(result.newPath, input.document);
      }
      return { dataRevision: result.dataRevision };
    });
  }

  saveScheduleDocument(
    input: SaveScheduleDocumentInput,
  ): Promise<{ schedule: Schedule; dataRevision: number }> {
    return this.run('write', () => {
      const nowDate = this.now();
      const nowMs = nowDate.getTime();
      const timestamp = nowDate.toISOString();
      const result = this.commit((db) => {
        const { schedule, project } = this.scheduleForWrite(db, input.scheduleId, 'editor');
        if (schedule.archivedAt !== null) {
          throw new RepositoryError('validation', ARCHIVED_EDIT_COPY);
        }
        const currentLock = activeLock(schedule.lock, nowMs);
        if (currentLock === null || currentLock.userId !== db.currentUserId) {
          throw new RepositoryError('conflict', LOCK_EXPIRED_COPY);
        }
        if (schedule.dataRevision !== input.expectedRevision) {
          throw new RepositoryError('conflict', REVISION_CONFLICT_COPY);
        }
        const activityCount = countScheduleActivities(input.document);
        if (activityCount > MAX_ACTIVITY_COUNT) {
          throw new RepositoryError('validation', INVALID_VALUES);
        }
        const prevPath = schedule.dataFilePath;
        const nextPath = scheduleDataPath(project.workspaceId, project.id, schedule.id);
        const nextRev = schedule.dataRevision + 1;
        const statusDate =
          input.document.settings.statusDate === null
            ? null
            : input.document.settings.statusDate.slice(0, 10);
        schedule.dataFilePath = nextPath;
        schedule.dataRevision = nextRev;
        schedule.activityCount = activityCount;
        schedule.calculationMode = input.document.settings.displayMode;
        schedule.statusDate = statusDate;
        schedule.updatedAt = timestamp;
        syncProjectStatusDate(project, db.schedules);
        return {
          schedule: toSchedule(schedule, nowMs),
          dataRevision: nextRev,
          prevPath,
          nextPath,
        };
      });
      this.store.writeSnapshot(result.nextPath, input.document);
      if (result.prevPath !== null && result.prevPath !== result.nextPath) {
        this.store.removeSnapshot(result.prevPath);
      }
      return { schedule: result.schedule, dataRevision: result.dataRevision };
    });
  }

  acquireScheduleLock(scheduleId: ID): Promise<ScheduleLock> {
    return this.run('write', () => {
      const nowDate = this.now();
      const nowMs = nowDate.getTime();
      return this.commit((db) => {
        const { schedule } = this.scheduleForWrite(db, scheduleId, 'editor');
        if (schedule.archivedAt !== null) {
          throw new RepositoryError('validation', ARCHIVED_EDIT_COPY);
        }
        const blocker = lockHolderActive(schedule, db.currentUserId, nowMs);
        if (blocker !== null) {
          throw new RepositoryError(
            'conflict',
            `This schedule is being edited by ${blocker.userName}.`,
          );
        }
        const lock: ScheduleLock = {
          userId: db.currentUserId,
          userName: displayNameOf(db, db.currentUserId),
          lockedAt: nowDate.toISOString(),
          expiresAt: new Date(nowMs + LOCK_TTL_MS).toISOString(),
        };
        schedule.lock = lock;
        return lock;
      });
    });
  }

  renewScheduleLock(scheduleId: ID): Promise<ScheduleLock> {
    return this.run('write', () => {
      const nowDate = this.now();
      const nowMs = nowDate.getTime();
      return this.commit((db) => {
        const { schedule } = this.scheduleForWrite(db, scheduleId, 'editor');
        const currentLock = activeLock(schedule.lock, nowMs);
        if (currentLock === null || currentLock.userId !== db.currentUserId) {
          throw new RepositoryError('conflict', LOCK_EXPIRED_COPY);
        }
        const renewed: ScheduleLock = {
          ...currentLock,
          expiresAt: new Date(nowMs + LOCK_TTL_MS).toISOString(),
        };
        schedule.lock = renewed;
        return renewed;
      });
    });
  }

  releaseScheduleLock(scheduleId: ID): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const { schedule } = this.scheduleForWrite(db, scheduleId, 'editor');
        if (schedule.lock?.userId === db.currentUserId) {
          schedule.lock = null;
        }
      });
    });
  }

  forceReleaseScheduleLock(scheduleId: ID): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const { schedule } = this.scheduleForWrite(db, scheduleId, 'owner');
        schedule.lock = null;
      });
    });
  }

  listSharedWithMe(): Promise<SharedScheduleRow[]> {
    return this.run('read', () => this.sharedRows(this.store.read()));
  }

  getLibraryData(): Promise<LibraryData> {
    return this.run('read', () => {
      const db = this.store.read();
      const nowMs = this.now().getTime();
      const workspaces = db.workspaces
        .flatMap((workspace): WorkspaceSummary[] => {
          const myRole = roleOf(db, workspace.id, db.currentUserId);
          if (myRole === null) return [];
          const projectCount = db.projects.filter((p) => p.workspaceId === workspace.id).length;
          return [{ ...workspace, projectCount, myRole }];
        })
        .sort(compareWorkspaces);
      const workspaceIds = new Set(workspaces.map((w) => w.id));
      const projects = db.projects
        .filter((p) => workspaceIds.has(p.workspaceId))
        .sort(newestFirst((p) => p.updatedAt))
        .map((p) => projectSummary(db, p));
      const projectIds = new Set(projects.map((p) => p.id));
      const folders = db.folders.filter((f) => projectIds.has(f.projectId)).sort(compareNamed);
      const schedules = db.schedules
        .filter((s) => projectIds.has(s.projectId))
        .sort(compareSchedules)
        .map((s) => toSchedule(s, nowMs));
      return {
        workspaces,
        projects,
        folders,
        schedules,
        sharedWithMe: this.sharedRows(db),
      };
    });
  }

  private sharedRows(db: MockDb): SharedScheduleRow[] {
    // Sorted before the join: `newestFirst` breaks ties by `id`, which a row carries as
    // `shareId`. Like the inner joins of the Phase 2 view, a share whose schedule, project or
    // sharer is gone yields no row.
    return db.shares
      .filter((share) => share.sharedWithId === db.currentUserId)
      .sort(newestFirst((share) => share.sharedAt))
      .flatMap((share): SharedScheduleRow[] => {
        const schedule = db.schedules.find((s) => s.id === share.scheduleId);
        const project = db.projects.find((p) => p.id === schedule?.projectId);
        const sharer = db.users.find((u) => u.id === share.sharedById);
        if (!schedule || !project || !sharer) return [];
        return [
          {
            shareId: share.id,
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            statusDate: schedule.statusDate,
            projectId: project.id,
            projectName: project.name,
            workspaceId: project.workspaceId,
            sharedBy: {
              id: sharer.id,
              firstName: sharer.firstName,
              lastName: sharer.lastName,
              avatarUrl: sharer.avatarUrl,
            },
            sharedAt: share.sharedAt,
          },
        ];
      });
  }

  listPendingTasks(): Promise<Task[]> {
    return this.run('read', () =>
      this.store
        .read()
        .tasks.filter((task) => !task.done)
        .sort(comparePendingTasks),
    );
  }

  setTaskDone(taskId: ID, done: boolean): Promise<Task> {
    return this.run('write', () =>
      this.commit((db) => {
        const task = db.tasks.find((t) => t.id === taskId);
        if (!task) throw new RepositoryError('not_found', 'Task not found');
        task.done = done;
        return task;
      }),
    );
  }

  listMembers(workspaceId: ID): Promise<WorkspaceMember[]> {
    return this.run('read', () => {
      const db = this.store.read();
      if (roleOf(db, workspaceId, db.currentUserId) === null) return [];
      return db.members
        .filter((member) => member.workspaceId === workspaceId)
        .flatMap((member): WorkspaceMember[] => {
          const user = db.users.find((u) => u.id === member.userId);
          if (!user) return [];
          return [
            {
              userId: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              role: member.role,
              joinedAt: member.joinedAt,
            },
          ];
        })
        .sort(compareMembers);
    });
  }

  listInvitations(workspaceId: ID): Promise<WorkspaceInvitation[]> {
    return this.run('read', () => {
      const db = this.store.read();
      if (!hasRole(db, workspaceId, 'owner')) return [];
      return db.invitations
        .filter((invitation) => invitation.workspaceId === workspaceId && isPending(invitation))
        .sort(newestFirst((invitation) => invitation.invitedAt))
        .map((invitation) => ({
          id: invitation.id,
          workspaceId: invitation.workspaceId,
          email: invitation.email,
          role: invitation.role,
          invitedAt: invitation.invitedAt,
        }));
    });
  }

  /**
   * The steps of the invitations Edge Function (P2 spec §5.7) in its order. An email that belongs
   * to a seed user adds that user at once; any other email gets a pending invitation, and inviting
   * it again refreshes that one invitation instead of adding a second.
   */
  inviteMember(input: { workspaceId: ID; email: string; role: Role }): Promise<InviteResult> {
    return this.run('write', () =>
      this.commit((db): InviteResult => {
        const email = emailKey(input.email);
        if (!EMAIL_PATTERN.test(email) || !isRole(input.role)) {
          throw new RepositoryError('validation', 'Check the email and role.');
        }
        // An unknown workspace has no owners, so it fails here too.
        if (!hasRole(db, input.workspaceId, 'owner')) {
          throw new RepositoryError('forbidden', 'Only workspace owners can invite people.');
        }
        const workspace = db.workspaces.find((w) => w.id === input.workspaceId);
        if (workspace?.kind !== 'team') {
          throw new RepositoryError('validation', 'Invite people to a team workspace.');
        }
        const timestamp = this.now().toISOString();
        const invitation = (acceptedAt: ISODateTime | null): MockInvitation => ({
          id: crypto.randomUUID(),
          workspaceId: workspace.id,
          email,
          role: input.role,
          invitedById: db.currentUserId,
          invitedAt: timestamp,
          acceptedAt,
          revokedAt: null,
        });

        const account = db.users.find((user) => emailKey(user.email) === email);
        if (account) {
          if (roleOf(db, workspace.id, account.id) !== null) {
            throw new RepositoryError('conflict', `${email} is already a member.`);
          }
          db.members.push({
            workspaceId: workspace.id,
            userId: account.id,
            role: input.role,
            joinedAt: timestamp,
          });
          // An already-accepted invitation records who added the member.
          db.invitations.push(invitation(timestamp));
          return { status: 'added' };
        }

        const pending = db.invitations.find(
          (i) => i.workspaceId === workspace.id && i.email === email && isPending(i),
        );
        if (pending) {
          pending.role = input.role;
          pending.invitedAt = timestamp;
          pending.invitedById = db.currentUserId;
        } else {
          db.invitations.push(invitation(null));
        }
        return { status: 'invited' };
      }),
    );
  }

  revokeInvitation(invitationId: ID): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const invitation = db.invitations.find((i) => i.id === invitationId);
        // A missing or settled invitation gets the same answer as a caller who isn't an owner.
        if (
          !invitation ||
          !isPending(invitation) ||
          !hasRole(db, invitation.workspaceId, 'owner')
        ) {
          throw new RepositoryError('forbidden', 'Only workspace owners can revoke invitations.');
        }
        invitation.revokedAt = this.now().toISOString();
      });
    });
  }

  updateMemberRole(input: { workspaceId: ID; userId: ID; role: Role }): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        memberToChange(db, input.workspaceId, input.userId).role = input.role;
        assertOwnerRemains(db, input.workspaceId);
      });
    });
  }

  removeMember(input: { workspaceId: ID; userId: ID }): Promise<void> {
    return this.run('write', () => {
      this.commit((db) => {
        const member = memberToChange(db, input.workspaceId, input.userId);
        db.members = db.members.filter((m) => m !== member);
        assertOwnerRemains(db, input.workspaceId);
      });
    });
  }

  updateProfile(input: { firstName: string; lastName: string }): Promise<User> {
    return this.run('write', () =>
      this.commit((db) => {
        const user = db.users.find((u) => u.id === db.currentUserId);
        if (!user) throw new RepositoryError('not_found', 'User not found');
        user.firstName = input.firstName.trim();
        user.lastName = input.lastName.trim();
        return user;
      }),
    );
  }

  /**
   * Every public method runs its body through here: it waits `latencyMs`, may fail a read with a
   * simulated network error, and turns any other error into a `RepositoryError` (spec §5.4).
   */
  private async run<T>(kind: LatencyOptions['kind'], op: () => T | Promise<T>): Promise<T> {
    try {
      return await withLatency(op, {
        latencyMs: this.latencyMs,
        failRate: this.failRate,
        kind,
        random: this.random,
      });
    } catch (error) {
      if (error instanceof RepositoryError) throw error;
      console.error('MockRepository: unexpected error', error);
      throw unknownError(error instanceof Error ? error.message : String(error), error);
    }
  }

  /**
   * Applies `change` in one store write and returns its result. When `change` throws, the store
   * keeps its previous data. The store keeps a copy parsed back from the saved text, so a record
   * returned from here is not linked to it.
   */
  private commit<T>(change: (db: MockDb) => T): T {
    let result!: T;
    this.store.write((db) => {
      result = change(db);
    });
    return result;
  }

  /**
   * The project of a schedule an editor or owner is about to change: an unknown schedule is R9's
   * 'validation', a caller without the editor role 'forbidden' (the order of the database's
   * schedule RPCs).
   */
  private editableProjectOf(db: MockDb, scheduleId: ID): Project {
    const schedule = db.schedules.find((s) => s.id === scheduleId);
    const project = db.projects.find((p) => p.id === schedule?.projectId);
    if (!project) throw new RepositoryError('validation', SCHEDULES_GONE);
    if (!hasRole(db, project.workspaceId, 'editor')) {
      throw new RepositoryError('forbidden', NO_PERMISSION);
    }
    return project;
  }

  /**
   * The schedules an archive (`'editor'`) or a delete (`'owner'`) names, in the order of the
   * database's array RPCs: R9's count, one project and every id found, then the caller's role in
   * the project's workspace ('forbidden' without it). `null` for an empty list.
   */
  private scheduleSetFor(
    db: MockDb,
    scheduleIds: readonly ID[],
    minRole: Role,
  ): { projectId: ID; found: MockSchedule[] } | null {
    const set = resolveScheduleSet(db.schedules, scheduleIds);
    if (!set) return null;
    const project = db.projects.find((p) => p.id === set.projectId);
    if (!project) throw new RepositoryError('validation', SCHEDULES_GONE);
    if (!hasRole(db, project.workspaceId, minRole)) {
      throw new RepositoryError('forbidden', NO_PERMISSION);
    }
    return set;
  }

  /** A stored schedule by id, or 'not_found' "Schedule not found" (no membership filter, D34). */
  private storedSchedule(scheduleId: ID): MockSchedule {
    const schedule = this.store.read().schedules.find((s) => s.id === scheduleId);
    if (!schedule) throw new RepositoryError('not_found', SCHEDULE_NOT_FOUND);
    return schedule;
  }

  /** A schedule + parent project for Phase 4 lock/materialize/save writes (not_found → forbidden). */
  private scheduleForWrite(
    db: MockDb,
    scheduleId: ID,
    minRole: Role,
  ): { schedule: MockSchedule; project: Project } {
    const schedule = db.schedules.find((s) => s.id === scheduleId);
    const project = db.projects.find((p) => p.id === schedule?.projectId);
    if (!schedule || !project) throw new RepositoryError('not_found', SCHEDULE_NOT_FOUND);
    if (!hasRole(db, project.workspaceId, minRole)) {
      throw new RepositoryError('forbidden', NO_PERMISSION);
    }
    return { schedule, project };
  }

  /**
   * Both schedule methods: an editor or owner of the project's workspace adds the schedule with a
   * code the project doesn't use yet (R8, checked after the project and the role, as the
   * database does) and sets the project's `updatedAt` to now. A blank schedule copies the
   * project's status date; an import stores what `importDetails` gives (`imported`), its status
   * date or else the project's. The project's first schedule becomes current (R1), and the
   * project's status date follows it (R6).
   */
  private addSchedule(
    input: { projectId: ID; folderId?: ID | null; name: string; code: string },
    imported: ImportScheduleInput | null,
  ): { schedule: Schedule; dataFilePath: string | null } {
    const { projectId } = input;
    const source: ScheduleSource = imported === null ? 'blank' : 'import';
    const nowDate = this.now();
    const timestamp = nowDate.toISOString();
    const nowMs = nowDate.getTime();
    return this.commit((db) => {
      const project = db.projects.find((p) => p.id === projectId);
      if (!project) throw new RepositoryError('not_found', 'Project not found');
      if (!hasRole(db, project.workspaceId, 'editor')) {
        throw new RepositoryError('forbidden', NO_PERMISSION);
      }
      const code = checkNewScheduleCode(db.schedules, projectId, input.code);
      const folderId = input.folderId ?? null;
      if (
        folderId !== null &&
        !db.folders.some((f) => f.id === folderId && f.projectId === projectId)
      ) {
        throw new RepositoryError('validation', 'Choose a folder in this project.');
      }
      const details = imported === null ? null : importDetails(imported);
      const scheduleId = crypto.randomUUID();
      const dataFilePath =
        imported === null ? null : scheduleDataPath(project.workspaceId, projectId, scheduleId);
      const schedule: MockSchedule = {
        id: scheduleId,
        projectId,
        folderId,
        copiedFromId: null,
        name: input.name.trim(),
        code,
        notes: null,
        statusDate: details?.statusDate ?? project.statusDate,
        source,
        sourceFileName: details?.sourceFileName ?? null,
        sourceFormat: details?.sourceFormat ?? null,
        isCurrent: !db.schedules.some((s) => s.projectId === projectId),
        baseline: 'none',
        updateNumber: null,
        archivedAt: null,
        activityCount: details?.activityCount ?? 0,
        sourceProjectCode: details?.sourceProjectCode ?? null,
        importReport: details?.importReport ?? null,
        importMapping: details?.importMapping ?? null,
        lock: null,
        dataRevision: imported === null ? 0 : 1,
        dataFilePath,
        calculationMode: imported === null ? 'calculated' : imported.calculationMode,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.schedules.push(schedule);
      syncProjectStatusDate(project, db.schedules);
      project.updatedAt = timestamp;
      return { schedule: toSchedule(schedule, nowMs), dataFilePath };
    });
  }
}
