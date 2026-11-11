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

// The import parser's types (P3 core spec §4.1, copied from P3 full §4.1 unchanged); src/import
// names them with `import type` only.
export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1254' | 'windows-1252';
export type ImportField =
  | 'code'
  | 'taskId'
  | 'name'
  | 'wbs'
  | 'duration'
  | 'start'
  | 'finish'
  | 'actualStart'
  | 'actualFinish'
  | 'activityType'
  | 'calendar'
  | 'constraintType'
  | 'constraintDate'
  | 'percentComplete'
  | 'predecessors'
  | 'notes';
export type ImportDateFormat = 'DD.MM.YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export interface TableMapping {
  sheet: string | null; // xlsx
  headerRow: number; // 1-based, 1–50
  delimiter: ',' | ';' | '\t' | null; // csv
  decimalSeparator: ',' | '.';
  dateFormat: ImportDateFormat;
  durationUnit: 'days' | 'hours'; // the unit of numbers without one (§5.7)
  hoursPerDay: number; // 1–24
  predecessorRef: 'code' | 'taskId'; // what predecessor tokens name (§5.7)
  skipRowsWithIssues: boolean; // false: bad cells are left empty; true: the whole row is skipped
  columns: Partial<Record<ImportField, { index: number; header: string }>>;
  assumptions: TableAssumptions; // fixed, stored so P4 never guesses (§5.8)
}
export interface TableAssumptions {
  // all values fixed in schemaVersion 1
  duration: 'original';
  startFinish: 'planned';
  percentComplete: 'duration';
  dateOnlyStart: '08:00';
  dateOnlyFinish: '17:00';
  weekUnitDays: 5;
  defaultWorkWeek: 'mon-fri'; // calendars made from names: Mon–Fri from 08:00, hoursPerDay hours, 1 h break at 12:00 when hoursPerDay > 4; longer than 15 h starts earlier (D61)
}
export interface ImportMapping {
  // everything P4 needs to read the file again
  schemaVersion: 1;
  format: ImportFormat;
  encoding: TextEncodingName | null; // xer, csv
  sourceProjectId: string | null; // xer: the PROJECT.proj_id this schedule was made from
  activityCodeField: string | null; // mspdi: 'UID', 'ID' or 'Text1'…'Text30'
  table: TableMapping | null; // xlsx, csv
}
export type ImportIssueSeverity = 'error' | 'warning' | 'info';
export interface ImportIssue {
  // every text field at most 200 characters (§5.10)
  severity: ImportIssueSeverity;
  code: string;
  message: string;
  location: string | null; // "TASK line 812" · "Task UID 41" · "Sheet1!B12" · "Line 40"
  original: string | null;
  used: string | null;
}
export interface ImportCount {
  entity: 'calendar' | 'wbs' | 'activity' | 'relationship';
  read: number;
  accepted: number;
  adjusted: number;
  skipped: number;
}
export type ImportOutcome = 'used' | 'kept' | 'not_read';
export type ImportCheckId =
  | 'actual_after_status_date'
  | 'progress_without_actual_start'
  | 'complete_without_actual_finish'
  | 'status_date_fallback'
  | 'ambiguous_milestones'
  | 'percent_lags'
  | 'links_on_summaries'
  | 'external_links'
  | 'project_dates_differ';
export interface ImportReport {
  schemaVersion: 1;
  parserVersion: string;
  format: ImportFormat;
  formatVersion: string | null; // XER ERMHDR version, MSPDI SaveVersion
  file: { name: string; size: number; sha256: string };
  formatFromContent: boolean; // true when the extension named another format (§5.2)
  activityCodeField: string | null; // mspdi; null for other formats
  sourceProject: {
    id: string | null;
    code: string | null;
    name: string | null;
    projectsInFile: number;
    rootWbsName: string | null;
    mustFinishBy: ISODate | null;
    stated: { start: ISODate | null; finish: ISODate | null };
  };
  encoding: { name: TextEncodingName; detectedBy: 'bom' | 'utf8' | 'byte-score' | 'user' } | null;
  table: Omit<TableMapping, 'columns'> | null;
  statusDate: {
    date: ISODate | null;
    time: string | null;
    source: 'file' | 'earliest-start' | 'user' | 'none';
  };
  dateRange: { start: ISODate | null; finish: ISODate | null }; // span of the accepted activities
  units: { minutesPerDay: number | null; calendars: Array<{ name: string; hoursPerDay: number }> };
  settings: Array<{ key: string; value: string }>; // source scheduling options kept for P4
  counts: ImportCount[];
  breakdown: {
    activitiesByType: Array<{ type: string; count: number }>;
    activitiesStarted: number;
    activitiesCompleted: number;
    relationshipsByType: Array<{ type: 'FS' | 'SS' | 'FF' | 'SF'; count: number }>;
    constraints: number;
    calendarExceptions: number;
  };
  outcomes: Array<{ element: string; outcome: ImportOutcome; items: number }>;
  checks: Array<{ id: ImportCheckId; findings: number }>; // every check, 0 included
  externalLinks: Array<{ target: string; links: number }>;
  notImported: Array<{ table: string; rows: number }>;
  issueTotals: Record<ImportIssueSeverity, number>; // always exact
  issues: ImportIssue[]; // errors, warnings, then notes; stored: §5.10 caps
  durationMs: number; // left out of golden comparisons, as is parserVersion
}
