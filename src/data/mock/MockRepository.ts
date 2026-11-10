import { RepositoryError } from '@/data/errors';
import { withLatency, type LatencyOptions } from '@/data/mock/latency';
import {
  applyDetails,
  checkNewScheduleCode,
  checkProjectStatusDate,
  compareSchedules,
  currentScheduleOf,
  makeCurrent,
  SCHEDULES_GONE,
  syncProjectStatusDate,
} from '@/data/mock/schedule-rules';
import type { MockDb, MockInvitation, MockMember } from '@/data/mock/seed';
import type { MockStore } from '@/data/mock/store';
import type {
  DataRepository,
  ImportScheduleInput,
  NewProjectInput,
  NewScheduleInput,
  NewTeamWorkspaceInput,
  UpdateProjectInput,
  UpdateScheduleDetailsInput,
} from '@/data/repository';
import { compareIds, compareMembers, compareWorkspaces, newestFirst } from '@/data/sort';
import type {
  ID,
  ISODateTime,
  ImportFormat,
  InviteResult,
  Project,
  ProjectAttributes,
  ProjectClient,
  ProjectLocation,
  ProjectSector,
  ProjectStage,
  ProjectStatus,
  ProjectSummary,
  ProjectType,
  Role,
  Schedule,
  ScheduleSource,
  SharedScheduleRow,
  Subscription,
  Task,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceSummary,
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

/** The project with its schedule counts (archived schedules counted apart) and current schedule. */
function projectSummary(db: MockDb, project: Project): ProjectSummary {
  const schedules = db.schedules.filter((schedule) => schedule.projectId === project.id);
  const current = currentScheduleOf(schedules, project.id);
  return {
    ...project,
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

/**
 * The interim import path (spec §2.4): an imported file's format from its extension. `null` for
 * any other file, which the database's source-format check would refuse.
 */
function importFormatOf(fileName: string): ImportFormat | null {
  switch (/\.[^.]+$/.exec(fileName)?.[0].toLowerCase()) {
    case '.xer':
      return 'xer';
    case '.xml':
      return 'mspdi';
    case '.csv':
      return 'csv';
    case '.xlsx':
      return 'xlsx';
    default:
      return null;
  }
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
      // One store write, as the database's single transaction (R12): the project, its schedules
      // and their shares go; its tasks stay without a project (`on delete set null`).
      this.commit((db) => {
        const project = db.projects.find((p) => p.id === projectId);
        if (!project) throw new RepositoryError('not_found', PROJECT_NOT_FOUND);
        if (!hasRole(db, project.workspaceId, 'owner')) {
          throw new RepositoryError('forbidden', NO_PERMISSION);
        }
        const scheduleIds = new Set(
          db.schedules.filter((s) => s.projectId === project.id).map((s) => s.id),
        );
        db.shares = db.shares.filter((share) => !scheduleIds.has(share.scheduleId));
        db.schedules = db.schedules.filter((s) => !scheduleIds.has(s.id));
        db.projects = db.projects.filter((p) => p !== project);
        for (const task of db.tasks) {
          if (task.projectId === project.id) task.projectId = null;
        }
      });
    });
  }

  createSchedule(input: NewScheduleInput): Promise<Schedule> {
    return this.run('write', () => this.addSchedule(input, 'blank', null));
  }

  importSchedule(input: ImportScheduleInput): Promise<Schedule> {
    return this.run('write', () => this.addSchedule(input, 'import', input.file.name));
  }

  listSchedules(projectId: ID): Promise<Schedule[]> {
    return this.run('read', () =>
      // No membership filter, as in getProject (spec D34).
      this.store
        .read()
        .schedules.filter((schedule) => schedule.projectId === projectId)
        .sort(compareSchedules),
    );
  }

  updateScheduleDetails(input: UpdateScheduleDetailsInput): Promise<Schedule> {
    return this.run('write', () => {
      const timestamp = this.now().toISOString();
      return this.commit((db) => {
        const project = this.editableProjectOf(db, input.scheduleId);
        const schedule = applyDetails(db.schedules, input, timestamp);
        syncProjectStatusDate(project, db.schedules);
        return schedule;
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

  listSharedWithMe(): Promise<SharedScheduleRow[]> {
    return this.run('read', () => {
      const db = this.store.read();
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
   * Both schedule methods: an editor or owner of the project's workspace adds the schedule with a
   * code the project doesn't use yet (R8, checked after the project and the role, as the
   * database does); it copies the project's status date and sets the project's `updatedAt` to now.
   * The project's first schedule becomes current (R1), which keeps the project's status date (R6).
   * An import takes its format from the file's extension (the interim path, spec §2.4).
   */
  private addSchedule(
    input: { projectId: ID; name: string; code: string },
    source: ScheduleSource,
    sourceFileName: string | null,
  ): Schedule {
    const { projectId } = input;
    const timestamp = this.now().toISOString();
    return this.commit((db) => {
      const project = db.projects.find((p) => p.id === projectId);
      if (!project) throw new RepositoryError('not_found', 'Project not found');
      if (!hasRole(db, project.workspaceId, 'editor')) {
        throw new RepositoryError('forbidden', NO_PERMISSION);
      }
      const code = checkNewScheduleCode(db.schedules, projectId, input.code);
      const sourceFormat = sourceFileName === null ? null : importFormatOf(sourceFileName);
      if (source === 'import' && sourceFormat === null) {
        throw new RepositoryError('validation', INVALID_VALUES);
      }
      const schedule: Schedule = {
        id: crypto.randomUUID(),
        projectId,
        name: input.name.trim(),
        code,
        notes: null,
        statusDate: project.statusDate,
        source,
        sourceFileName,
        sourceFormat,
        isCurrent: !db.schedules.some((s) => s.projectId === projectId),
        baseline: 'none',
        updateNumber: null,
        archivedAt: null,
        activityCount: 0,
        hasImportReport: false,
        hasImportMapping: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.schedules.push(schedule);
      syncProjectStatusDate(project, db.schedules);
      project.updatedAt = timestamp;
      return schedule;
    });
  }
}
