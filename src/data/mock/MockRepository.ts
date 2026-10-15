import { RepositoryError } from '@/data/errors';
import { withLatency, type LatencyOptions } from '@/data/mock/latency';
import type { MockDb } from '@/data/mock/seed';
import type { MockStore } from '@/data/mock/store';
import type {
  DataRepository,
  ImportScheduleInput,
  NewProjectInput,
  NewScheduleInput,
  NewTeamWorkspaceInput,
} from '@/data/repository';
import type {
  ID,
  ISODateTime,
  Project,
  ProjectSummary,
  Schedule,
  ScheduleSource,
  SharedScheduleRow,
  Subscription,
  Task,
  User,
  Workspace,
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

/** The workspace's projects, latest `updatedAt` first, with their schedule counts. */
function projectSummaries(db: MockDb, workspaceId: ID): ProjectSummary[] {
  return db.projects
    .filter((project) => project.workspaceId === workspaceId)
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))
    .map((project) => ({
      ...project,
      scheduleCount: db.schedules.filter((schedule) => schedule.projectId === project.id).length,
    }));
}

/** Due date ascending with undated tasks last, then oldest first. */
function comparePendingTasks(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    // 'YYYY-MM-DD' strings sort in calendar order, so date-only values are never parsed here.
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return time(a.createdAt) - time(b.createdAt);
}

/** `DataRepository` over the mock store (spec §5.6). */
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
      const personal = db.workspaces.filter((w) => w.kind === 'personal');
      // With no locale given, localeCompare follows the browser's language.
      const teams = db.workspaces
        .filter((w) => w.kind === 'team')
        .sort((a, b) => a.name.localeCompare(b.name, 'en'));
      return [...personal, ...teams].map((workspace) => ({
        ...workspace,
        projectCount: db.projects.filter((p) => p.workspaceId === workspace.id).length,
      }));
    });
  }

  createTeamWorkspace(input: NewTeamWorkspaceInput): Promise<Workspace> {
    return this.run('write', () =>
      this.commit((db) => {
        const workspace: Workspace = {
          id: crypto.randomUUID(),
          name: input.name.trim(),
          kind: 'team',
          createdAt: this.now().toISOString(),
        };
        db.workspaces.push(workspace);
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
      // The image is read first. The ID check and the insert below then run in one synchronous
      // write, so two overlapping calls with the same ID cannot both pass the check.
      const coverImageUrl = input.coverImage ? await readAsDataUrl(input.coverImage) : null;
      const timestamp = this.now().toISOString();
      return this.commit((db) => {
        const code = input.code.trim();
        if (!db.workspaces.some((w) => w.id === input.workspaceId)) {
          throw new RepositoryError('not_found', 'Workspace not found');
        }
        const key = codeKey(code);
        if (
          db.projects.some((p) => p.workspaceId === input.workspaceId && codeKey(p.code) === key)
        ) {
          throw new RepositoryError('conflict', 'This ID is already used in this workspace');
        }
        const project: Project = {
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          code,
          name: input.name.trim(),
          description: optionalText(input.description),
          coverImageUrl,
          statusDate: optionalText(input.statusDate),
          attributes: {
            projectType: input.attributes.projectType,
            startDate: optionalText(input.attributes.startDate),
            plannedFinishDate: optionalText(input.attributes.plannedFinishDate),
          },
          client: {
            name: optionalText(input.client.name),
            contactName: optionalText(input.client.contactName),
            contactEmail: optionalText(input.client.contactEmail),
          },
          location: {
            address: optionalText(input.location.address),
            city: optionalText(input.location.city),
            country: optionalText(input.location.country),
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        db.projects.push(project);
        return project;
      });
    });
  }

  createSchedule(input: NewScheduleInput): Promise<Schedule> {
    return this.run('write', () => this.addSchedule(input.projectId, input.name, 'blank', null));
  }

  importSchedule(input: ImportScheduleInput): Promise<Schedule> {
    return this.run('write', () =>
      this.addSchedule(input.projectId, input.name, 'import', input.file.name),
    );
  }

  listSharedWithMe(): Promise<SharedScheduleRow[]> {
    return this.run('read', () => {
      const db = this.store.read();
      // Like the inner joins of the Phase 2 view: a share whose schedule, project or sharer is
      // gone yields no row.
      return db.shares
        .filter((share) => share.sharedWithId === db.currentUserId)
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
        })
        .sort((a, b) => time(b.sharedAt) - time(a.sharedAt));
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

  /** Both schedule methods: copies the project's status date and sets its `updatedAt` to now. */
  private addSchedule(
    projectId: ID,
    name: string,
    source: ScheduleSource,
    sourceFileName: string | null,
  ): Schedule {
    const timestamp = this.now().toISOString();
    return this.commit((db) => {
      const project = db.projects.find((p) => p.id === projectId);
      if (!project) throw new RepositoryError('not_found', 'Project not found');
      const schedule: Schedule = {
        id: crypto.randomUUID(),
        projectId,
        name: name.trim(),
        statusDate: project.statusDate,
        source,
        sourceFileName,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.schedules.push(schedule);
      project.updatedAt = timestamp;
      return schedule;
    });
  }
}
