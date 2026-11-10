// Converts Supabase rows (snake_case, Postgres timestamps) to the domain types in `src/data/types.ts`
// (P2 spec §8.2). Views report every column as nullable; `need` turns a missing value into an error
// instead of letting `null` leak into a field the contract says is always set.
import type { NewProjectInput, UpdateProjectInput } from '@/data/repository';
import type { Database } from '@/data/supabase/database.types';
import type {
  BaselineFlag,
  ISODateTime,
  ImportFormat,
  Plan,
  Project,
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
  WorkspaceKind,
  WorkspaceMember,
  WorkspaceSummary,
} from '@/data/types';

type Tables = Database['public']['Tables'];
type Views = Database['public']['Views'];

type ProfileRow = Tables['profiles']['Row'];
type SubscriptionRow = Tables['subscriptions']['Row'];
type WorkspaceRow = Tables['workspaces']['Row'];
type WorkspaceSummaryRow = Views['workspace_summaries']['Row'];
type ProjectRow = Tables['projects']['Row'];
type ProjectSummaryRow = Views['project_summaries']['Row'];
type ScheduleItemRow = Views['schedule_items']['Row'];
type SharedRow = Views['shared_with_me']['Row'];
type TaskRow = Tables['tasks']['Row'];
type InvitationRow = Tables['workspace_invitations']['Row'];
type ProjectInsert = Tables['projects']['Insert'];
type ProjectUpdate = Tables['projects']['Update'];

function need<T>(value: T | null | undefined, column: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Supabase row is missing "${column}"`);
  }
  return value;
}

/** Postgres returns microseconds and `+00:00`; the domain uses `Date#toISOString()` form. */
export function toIso(value: string): ISODateTime {
  return new Date(value).toISOString();
}

const toIsoOrNull = (value: string | null): ISODateTime | null =>
  value === null ? null : toIso(value);

/** The trimmed text, or `null` when nothing is left. */
function optionalText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** A `numeric` column as a number; `null` stays `null`. */
const numberOrNull = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

export function mapUser(row: ProfileRow): User {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    avatarUrl: row.avatar_url,
  };
}

export function mapSubscription(row: SubscriptionRow): Subscription {
  return { plan: row.plan as Plan, trialEndsAt: toIsoOrNull(row.trial_ends_at) };
}

export function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as WorkspaceKind,
    createdAt: toIso(row.created_at),
  };
}

export function mapWorkspaceSummary(row: WorkspaceSummaryRow): WorkspaceSummary {
  return {
    id: need(row.id, 'id'),
    name: need(row.name, 'name'),
    kind: need(row.kind, 'kind') as WorkspaceKind,
    createdAt: toIso(need(row.created_at, 'created_at')),
    projectCount: need(row.project_count, 'project_count'),
    myRole: need(row.my_role, 'my_role') as Role,
  };
}

// A `projects` row fits this shape too, so both project mappers share one conversion.
function projectFrom(
  row: Omit<
    ProjectSummaryRow,
    'schedule_count' | 'total_schedule_count' | 'current_schedule_id' | 'current_schedule_name'
  >,
  coverUrl: string | null,
): Project {
  return {
    id: need(row.id, 'id'),
    workspaceId: need(row.workspace_id, 'workspace_id'),
    code: need(row.code, 'code'),
    name: need(row.name, 'name'),
    description: row.description,
    coverImageUrl: coverUrl,
    statusDate: row.status_date,
    attributes: {
      status: need(row.status, 'status') as ProjectStatus,
      stage: row.stage as ProjectStage | null,
      projectType: row.project_type as ProjectType | null,
      sector: row.sector as ProjectSector | null,
      startDate: row.start_date,
      plannedFinishDate: row.planned_finish_date,
    },
    client: {
      name: row.client_name,
      contactName: row.client_contact_name,
      contactEmail: row.client_contact_email,
    },
    location: {
      address: row.location_address,
      city: row.location_city,
      country: row.location_country,
      latitude: numberOrNull(row.location_lat),
      longitude: numberOrNull(row.location_lng),
    },
    createdAt: toIso(need(row.created_at, 'created_at')),
    updatedAt: toIso(need(row.updated_at, 'updated_at')),
  };
}

export function mapProject(row: ProjectRow, coverUrl: string | null): Project {
  return projectFrom(row, coverUrl);
}

export function mapProjectSummary(row: ProjectSummaryRow, coverUrl: string | null): ProjectSummary {
  const { current_schedule_id: currentId, current_schedule_name: currentName } = row;
  return {
    ...projectFrom(row, coverUrl),
    scheduleCount: need(row.schedule_count, 'schedule_count'),
    totalScheduleCount: need(row.total_schedule_count, 'total_schedule_count'),
    currentSchedule:
      currentId !== null && currentName !== null ? { id: currentId, name: currentName } : null,
  };
}

/** A `schedule_items` row; the view never carries the stored path, mapping or report. */
export function mapScheduleItem(row: ScheduleItemRow): Schedule {
  return {
    id: need(row.id, 'id'),
    projectId: need(row.project_id, 'project_id'),
    name: need(row.name, 'name'),
    code: row.code,
    notes: row.notes,
    statusDate: row.status_date,
    source: need(row.source, 'source') as ScheduleSource,
    sourceFileName: row.source_file_name,
    sourceFormat: row.source_format as ImportFormat | null,
    isCurrent: need(row.is_current, 'is_current'),
    baseline: need(row.baseline, 'baseline') as BaselineFlag,
    updateNumber: row.update_number,
    archivedAt: toIsoOrNull(row.archived_at),
    activityCount: need(row.activity_count, 'activity_count'),
    hasImportReport: need(row.has_import_report, 'has_import_report'),
    hasImportMapping: need(row.has_import_mapping, 'has_import_mapping'),
    createdAt: toIso(need(row.created_at, 'created_at')),
    updatedAt: toIso(need(row.updated_at, 'updated_at')),
  };
}

export function mapSharedRow(row: SharedRow): SharedScheduleRow {
  return {
    shareId: need(row.share_id, 'share_id'),
    scheduleId: need(row.schedule_id, 'schedule_id'),
    scheduleName: need(row.schedule_name, 'schedule_name'),
    statusDate: row.status_date,
    projectId: need(row.project_id, 'project_id'),
    projectName: need(row.project_name, 'project_name'),
    workspaceId: need(row.workspace_id, 'workspace_id'),
    sharedBy: {
      id: need(row.shared_by_id, 'shared_by_id'),
      firstName: need(row.shared_by_first_name, 'shared_by_first_name'),
      lastName: need(row.shared_by_last_name, 'shared_by_last_name'),
      avatarUrl: row.shared_by_avatar_url,
    },
    sharedAt: toIso(need(row.shared_at, 'shared_at')),
  };
}

export function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    done: row.done,
    projectId: row.project_id,
    createdAt: toIso(row.created_at),
  };
}

/** A `workspace_members` row joined to its `profiles` row. */
export function mapMember(row: {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { first_name: string; last_name: string; email: string };
}): WorkspaceMember {
  return {
    userId: row.user_id,
    firstName: row.profiles.first_name,
    lastName: row.profiles.last_name,
    email: row.profiles.email,
    role: row.role as Role,
    joinedAt: toIso(row.joined_at),
  };
}

export function mapInvitation(row: InvitationRow): WorkspaceInvitation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    role: row.role as Role,
    invitedAt: toIso(row.created_at),
  };
}

/**
 * The columns an insert and an update both write, from the form input: text trimmed, empty text
 * stored as `null`. Status, stage, type, sector and coordinates go as they are; the database
 * checks them.
 */
function projectColumns(
  input: Pick<
    NewProjectInput,
    'code' | 'name' | 'description' | 'attributes' | 'client' | 'location'
  >,
) {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    description: optionalText(input.description),
    status: input.attributes.status,
    stage: input.attributes.stage,
    project_type: input.attributes.projectType,
    sector: input.attributes.sector,
    start_date: optionalText(input.attributes.startDate),
    planned_finish_date: optionalText(input.attributes.plannedFinishDate),
    client_name: optionalText(input.client.name),
    client_contact_name: optionalText(input.client.contactName),
    client_contact_email: optionalText(input.client.contactEmail),
    location_address: optionalText(input.location.address),
    location_city: optionalText(input.location.city),
    location_country: optionalText(input.location.country),
    location_lat: input.location.latitude,
    location_lng: input.location.longitude,
  } satisfies ProjectUpdate;
}

/** The `projects` insert for the form input: text trimmed, empty text stored as `null`. */
export function toProjectInsert(input: NewProjectInput, coverPath: string | null): ProjectInsert {
  return {
    workspace_id: input.workspaceId,
    ...projectColumns(input),
    cover_image_path: coverPath,
    status_date: optionalText(input.statusDate),
  };
}

/**
 * The `projects` update for the edit input, trimmed as `toProjectInsert` does. It has no
 * `status_date` key when the input has no status date (R6), and no `cover_image_path` key when
 * `coverPath` is `undefined` (the cover is kept).
 */
export function toProjectUpdate(
  input: UpdateProjectInput,
  coverPath: string | null | undefined,
): ProjectUpdate {
  const update: ProjectUpdate = projectColumns(input);
  if (input.statusDate !== undefined) update.status_date = optionalText(input.statusDate);
  if (coverPath !== undefined) update.cover_image_path = coverPath;
  return update;
}
