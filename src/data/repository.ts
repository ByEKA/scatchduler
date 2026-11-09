import type {
  ID,
  ISODate,
  InviteResult,
  Project,
  ProjectAttributes,
  ProjectClient,
  ProjectLocation,
  ProjectSummary,
  Role,
  Schedule,
  SharedScheduleRow,
  Subscription,
  Task,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
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

/** What `updateProject` does with the cover: keep it, remove it, or replace it with the file. */
export type CoverChange = 'keep' | 'remove' | File;

export interface UpdateProjectInput {
  projectId: ID;
  code: string;
  name: string;
  description: string | null;
  cover: CoverChange;
  statusDate?: ISODate | null; // left out while the project has a current schedule (R6)
  attributes: ProjectAttributes;
  client: ProjectClient;
  location: ProjectLocation;
}

export interface NewScheduleInput {
  projectId: ID;
  name: string;
  code: string; // trimmed by the adapter; required and unique in the project, ignoring case (R8)
}

export interface ImportScheduleInput {
  projectId: ID;
  name: string;
  code: string; // as NewScheduleInput's
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
  /**
   * Rejects with RepositoryError('conflict') when the code is taken, and 'validation' when a
   * status, stage, type or sector is outside its list or the coordinates aren't a valid pair.
   */
  createProject(input: NewProjectInput): Promise<Project>;
  /** 'not_found' "Project not found" when unknown (or hidden by RLS, Supabase only; D34). */
  getProject(projectId: ID): Promise<ProjectSummary>;
  /**
   * Editors and owners; viewers 'forbidden', unknown (or hidden) projects 'not_found'. Checks the
   * values as `createProject` does; a code another project of the workspace has is 'conflict'
   * "This ID is already used in this workspace". Leaves the status date alone when the input has
   * none, and sets `updatedAt` to now.
   */
  updateProject(input: UpdateProjectInput): Promise<Project>;

  /**
   * Both set the parent project's updatedAt to now. A blank or malformed code rejects
   * 'validation', a code the project already uses (ignoring case) 'conflict' (R8).
   */
  createSchedule(input: NewScheduleInput): Promise<Schedule>;
  importSchedule(input: ImportScheduleInput): Promise<Schedule>;

  /** sharedAt descending. */
  listSharedWithMe(): Promise<SharedScheduleRow[]>;

  /** Tasks with done === false: dueDate ascending (nulls last), then createdAt ascending. */
  listPendingTasks(): Promise<Task[]>;
  setTaskDone(taskId: ID, done: boolean): Promise<Task>;

  /** Owners first, then editors, then viewers; by name within a role (shared comparator). */
  listMembers(workspaceId: ID): Promise<WorkspaceMember[]>;
  /** Pending invitations, newest first; an empty list for non-owners. */
  listInvitations(workspaceId: ID): Promise<WorkspaceInvitation[]>;
  /** Rejects 'forbidden' (not an owner), 'validation' (personal workspace), 'conflict' (already a member). */
  inviteMember(input: { workspaceId: ID; email: string; role: Role }): Promise<InviteResult>;
  revokeInvitation(invitationId: ID): Promise<void>;
  /** Both reject 'validation' with "A workspace needs at least one owner." when no owner would remain. */
  updateMemberRole(input: { workspaceId: ID; userId: ID; role: Role }): Promise<void>;
  removeMember(input: { workspaceId: ID; userId: ID }): Promise<void>;
  updateProfile(input: { firstName: string; lastName: string }): Promise<User>;
}
