import type {
  ID,
  ISODate,
  Project,
  ProjectAttributes,
  ProjectClient,
  ProjectLocation,
  ProjectSummary,
  Schedule,
  SharedScheduleRow,
  Subscription,
  Task,
  User,
  Workspace,
  WorkspaceSummary,
} from './types';

export interface NewProjectInput {
  workspaceId: ID;
  code: string;
  name: string;
  description: string | null;
  coverImage: File | null; // adapter stores it (mock: data URL, Supabase: Storage upload)
  statusDate: ISODate | null;
  attributes: ProjectAttributes;
  client: ProjectClient;
  location: ProjectLocation;
}

export interface NewScheduleInput {
  projectId: ID;
  name: string;
}

export interface ImportScheduleInput {
  projectId: ID;
  name: string;
  file: File; // Phase 1: metadata only; Phase 2: uploaded to Storage
}

export interface NewTeamWorkspaceInput {
  name: string;
}

export interface DataRepository {
  getCurrentUser(): Promise<User>;
  getSubscription(): Promise<Subscription>;

  /** Personal workspace first, then team workspaces by name (A→Z). */
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  createTeamWorkspace(input: NewTeamWorkspaceInput): Promise<Workspace>;

  /** All projects of a workspace, updatedAt descending. */
  listProjects(workspaceId: ID): Promise<ProjectSummary[]>;
  /** First `limit` items of listProjects(workspaceId). */
  listRecentProjects(workspaceId: ID, limit: number): Promise<ProjectSummary[]>;
  /** Case-insensitive, trimmed comparison against existing codes in the workspace. */
  isProjectCodeAvailable(workspaceId: ID, code: string): Promise<boolean>;
  /** Rejects with RepositoryError('conflict') when the code is taken. */
  createProject(input: NewProjectInput): Promise<Project>;

  /** Both set the parent project's updatedAt to now. */
  createSchedule(input: NewScheduleInput): Promise<Schedule>;
  importSchedule(input: ImportScheduleInput): Promise<Schedule>;

  /** sharedAt descending. */
  listSharedWithMe(): Promise<SharedScheduleRow[]>;

  /** Tasks with done === false: dueDate ascending (nulls last), then createdAt ascending. */
  listPendingTasks(): Promise<Task[]>;
  setTaskDone(taskId: ID, done: boolean): Promise<Task>;
}
