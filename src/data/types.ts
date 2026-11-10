export type ID = string; // UUID v4
export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // ISO 8601, e.g. '2026-10-14T09:30:00.000Z'

export interface User {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
}

export type Plan = 'trial' | 'free' | 'pro';

export interface Subscription {
  plan: Plan;
  trialEndsAt: ISODateTime | null; // set only when plan === 'trial'
}

export type WorkspaceKind = 'personal' | 'team';

export interface Workspace {
  id: ID;
  name: string;
  kind: WorkspaceKind;
  createdAt: ISODateTime;
}

export type Role = 'owner' | 'editor' | 'viewer';

export interface WorkspaceSummary extends Workspace {
  projectCount: number;
  myRole: Role;
}

export interface WorkspaceMember {
  userId: ID;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  joinedAt: ISODateTime;
}

export interface WorkspaceInvitation {
  id: ID;
  workspaceId: ID;
  email: string;
  role: Role;
  invitedAt: ISODateTime;
}

export type InviteResult = { status: 'added' | 'invited' };

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

export type ProjectStage =
  'pursuit' | 'preconstruction' | 'construction' | 'closeout' | 'completed';

export type ProjectType =
  | 'building'
  | 'residential'
  | 'infrastructure'
  | 'industrial'
  | 'energy'
  | 'transportation'
  | 'water'
  | 'other';

/** Ownership (P3 core spec D2). */
export type ProjectSector = 'public' | 'private' | 'public_private';

export interface ProjectAttributes {
  status: ProjectStatus; // 'active' by default
  stage: ProjectStage | null;
  projectType: ProjectType | null;
  sector: ProjectSector | null;
  startDate: ISODate | null;
  plannedFinishDate: ISODate | null;
}

export interface ProjectClient {
  name: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

/** `latitude` and `longitude` are WGS 84 decimal degrees, both set or both `null`. */
export interface ProjectLocation {
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Project {
  id: ID;
  workspaceId: ID;
  code: string; // user-facing "Project ID", unique per workspace (case-insensitive)
  name: string;
  description: string | null;
  coverImageUrl: string | null; // mock: data URL; Supabase: Storage URL
  statusDate: ISODate | null; // data date of the project's schedules
  attributes: ProjectAttributes;
  client: ProjectClient;
  location: ProjectLocation;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProjectSummary extends Project {
  scheduleCount: number; // schedules that aren't archived
  totalScheduleCount: number; // archived included (the Delete project dialog)
  currentSchedule: { id: ID; name: string } | null;
}

export type ScheduleSource = 'blank' | 'import';

export type ImportFormat = 'xer' | 'mspdi' | 'xlsx' | 'csv';

export type BaselineFlag = 'none' | 'baseline' | 'primary';

/** The app map's ScheduleVersion (P3 full D2); the UI says "schedule" everywhere. */
export interface Schedule {
  id: ID;
  projectId: ID;
  name: string;
  code: string | null; // required from Phase 3 core on (R8); P2-era rows null until edited
  notes: string | null;
  statusDate: ISODate | null;
  source: ScheduleSource;
  sourceFileName: string | null;
  sourceFormat: ImportFormat | null; // null exactly when source === 'blank'
  isCurrent: boolean;
  baseline: BaselineFlag;
  updateNumber: number | null;
  archivedAt: ISODateTime | null;
  activityCount: number; // 0 for blank schedules; set by import
  hasImportReport: boolean; // false for blank schedules and P2-era imports
  hasImportMapping: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SharedScheduleRow {
  shareId: ID;
  scheduleId: ID;
  scheduleName: string;
  statusDate: ISODate | null;
  projectId: ID;
  projectName: string;
  workspaceId: ID;
  sharedBy: Pick<User, 'id' | 'firstName' | 'lastName' | 'avatarUrl'>;
  sharedAt: ISODateTime;
}

export interface Task {
  id: ID;
  title: string;
  dueDate: ISODate | null;
  done: boolean;
  projectId: ID | null;
  createdAt: ISODateTime;
}
