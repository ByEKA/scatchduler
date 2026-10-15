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

export interface WorkspaceSummary extends Workspace {
  projectCount: number;
}

export type ProjectType = 'building' | 'infrastructure' | 'industrial' | 'residential' | 'other';

export interface ProjectAttributes {
  projectType: ProjectType | null;
  startDate: ISODate | null;
  plannedFinishDate: ISODate | null;
}

export interface ProjectClient {
  name: string | null;
  contactName: string | null;
  contactEmail: string | null;
}

export interface ProjectLocation {
  address: string | null;
  city: string | null;
  country: string | null;
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
  scheduleCount: number;
}

export type ScheduleSource = 'blank' | 'import';

export interface Schedule {
  id: ID;
  projectId: ID;
  name: string;
  statusDate: ISODate | null;
  source: ScheduleSource;
  sourceFileName: string | null;
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
