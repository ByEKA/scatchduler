// `DataRepository` on Supabase (P2 spec §8.2). Reads go through the security-invoker views and
// tables under RLS; member changes through the RPCs and the `invitations` Edge Function. Every
// error becomes a `RepositoryError` (P2 spec §8.4).
import { RepositoryError } from '@/data/errors';
import type {
  DataRepository,
  ImportScheduleInput,
  NewProjectInput,
  NewScheduleInput,
  NewTeamWorkspaceInput,
  UpdateProjectInput,
  UpdateScheduleDetailsInput,
} from '@/data/repository';
import { compareMembers, compareWorkspaces } from '@/data/sort';
import type { AppSupabaseClient } from '@/data/supabase/client';
import { functionError, toRepositoryError } from '@/data/supabase/errors';
import {
  mapInvitation,
  mapMember,
  mapProject,
  mapProjectSummary,
  mapScheduleItem,
  mapSharedRow,
  mapSubscription,
  mapTask,
  mapUser,
  mapWorkspaceSummary,
  toProjectInsert,
  toProjectUpdate,
} from '@/data/supabase/mappers';
import { createSignedUrlCache, type SignedUrlCache } from '@/data/supabase/signed-urls';
import type {
  ID,
  InviteResult,
  Project,
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
} from '@/data/types';

const COVERS = 'project-covers';
const IMPORTS = 'schedule-imports';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Stands in for an id that isn't a UUID: no row has it, so it behaves as any unknown id. */
const NO_ROW_ID = '00000000-0000-0000-0000-000000000000';

/** Postgres rejects a malformed UUID outright; an unknown id gets the unknown-id answer instead. */
const asUuid = (id: ID): ID => (UUID.test(id) ? id : NO_ROW_ID);

const SESSION_EXPIRED = 'Your session expired. Please sign in again.';
const NO_PERMISSION = "You don't have permission to do that.";
const PROJECT_NOT_FOUND = 'Project not found';
const TASK_NOT_FOUND = 'Task not found';

/** `.png` for PNG covers, `.jpg` for everything else (the bucket takes JPEG and PNG only). */
const coverExtension = (file: File): string => (file.type === 'image/png' ? '.png' : '.jpg');

/**
 * The interim import path (spec §2.4): the format comes from the file's extension, one of the
 * types the P2 import dialog takes, and names the stored object's suffix (§4.9). Original names
 * never reach the key.
 */
function interimImportFormat(
  fileName: string,
): { format: 'xer' | 'mspdi' | 'csv'; suffix: string } | null {
  switch (/\.[^.]+$/.exec(fileName)?.[0].toLowerCase()) {
    case '.xer':
      return { format: 'xer', suffix: 'xer.gz' };
    case '.xml':
      return { format: 'mspdi', suffix: 'xml.gz' };
    case '.csv':
      return { format: 'csv', suffix: 'csv.gz' };
    default:
      return null;
  }
}

export class SupabaseRepository implements DataRepository {
  private readonly client: AppSupabaseClient;
  private readonly signedUrls: SignedUrlCache;

  constructor(client: AppSupabaseClient, options: { signedUrls?: SignedUrlCache } = {}) {
    this.client = client;
    this.signedUrls =
      options.signedUrls ??
      createSignedUrlCache(async (bucket, paths, expiresIn) => {
        const { data, error } = await client.storage
          .from(bucket)
          .createSignedUrls(paths, expiresIn);
        if (error) throw error;
        return data.flatMap((item) =>
          item.path && item.signedUrl ? [{ path: item.path, signedUrl: item.signedUrl }] : [],
        );
      });
  }

  async getCurrentUser(): Promise<User> {
    return this.run(async () => {
      const userId = await this.sessionUserId();
      const { data, error } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw toRepositoryError(error, { notFound: 'User not found' });
      return mapUser(data);
    });
  }

  async getSubscription(): Promise<Subscription> {
    return this.run(async () => {
      const { data, error } = await this.client.from('subscriptions').select('*').single();
      if (error) throw error;
      return mapSubscription(data);
    });
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.run(async () => {
      const { data, error } = await this.client.from('workspace_summaries').select('*');
      if (error) throw error;
      return data.map(mapWorkspaceSummary).sort(compareWorkspaces);
    });
  }

  async createTeamWorkspace(input: NewTeamWorkspaceInput): Promise<Workspace> {
    return this.run(async () => {
      const { data, error } = await this.client.rpc('create_team_workspace', {
        p_name: input.name,
      });
      if (error) throw error;
      const summary = mapWorkspaceSummary(data);
      return {
        id: summary.id,
        name: summary.name,
        kind: summary.kind,
        createdAt: summary.createdAt,
      };
    });
  }

  listProjects(workspaceId: ID): Promise<ProjectSummary[]> {
    return this.projectSummaries(workspaceId, null);
  }

  listRecentProjects(workspaceId: ID, limit: number): Promise<ProjectSummary[]> {
    return this.projectSummaries(workspaceId, Math.max(0, limit));
  }

  async isProjectCodeAvailable(workspaceId: ID, code: string): Promise<boolean> {
    return this.run(async () => {
      const { data, error } = await this.client.rpc('is_project_code_available', {
        p_workspace_id: asUuid(workspaceId),
        p_code: code,
      });
      if (error) throw error;
      return data;
    });
  }

  async createProject(input: NewProjectInput): Promise<Project> {
    return this.run(async () => {
      if (!UUID.test(input.workspaceId)) {
        throw new RepositoryError('not_found', 'Workspace not found');
      }
      let coverPath: string | null = null;
      if (input.coverImage) {
        const file = input.coverImage;
        coverPath = `${input.workspaceId}/${crypto.randomUUID()}${coverExtension(file)}`;
        const { error } = await this.client.storage.from(COVERS).upload(coverPath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (error) throw error;
      }
      const { data, error } = await this.client
        .from('projects')
        .insert(toProjectInsert(input, coverPath))
        .select('*')
        .single();
      if (error) {
        if (coverPath) await this.removeQuietly(COVERS, coverPath);
        throw error;
      }
      return mapProject(data, await this.coverUrl(data.cover_image_path));
    });
  }

  async getProject(projectId: ID): Promise<ProjectSummary> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from('project_summaries')
        .select('*')
        .eq('id', asUuid(projectId))
        .single();
      if (error) throw toRepositoryError(error, { notFound: PROJECT_NOT_FOUND });
      return mapProjectSummary(data, await this.coverUrl(data.cover_image_path));
    });
  }

  /**
   * A new cover is uploaded before the update and removed again when the update fails; after a
   * successful update the replaced or removed cover's object is deleted (best effort). RLS only
   * filters an update, so no row back from a project the read could see is `forbidden` (§4.10).
   */
  async updateProject(input: UpdateProjectInput): Promise<Project> {
    return this.run(async () => {
      const { data: current, error: readError } = await this.client
        .from('projects')
        .select('id, workspace_id, cover_image_path')
        .eq('id', asUuid(input.projectId))
        .maybeSingle();
      if (readError) throw toRepositoryError(readError, { notFound: PROJECT_NOT_FOUND });
      if (current === null) throw new RepositoryError('not_found', PROJECT_NOT_FOUND);

      // undefined keeps the cover, null removes it, a path replaces it.
      let coverPath: string | null | undefined;
      let uploaded: string | null = null;
      if (input.cover instanceof File) {
        const file = input.cover;
        uploaded = `${current.workspace_id}/${crypto.randomUUID()}${coverExtension(file)}`;
        const { error } = await this.client.storage.from(COVERS).upload(uploaded, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
        if (error) throw error;
        coverPath = uploaded;
      } else if (input.cover === 'remove') {
        coverPath = null;
      }

      const { data, error } = await this.client
        .from('projects')
        .update(toProjectUpdate(input, coverPath))
        .eq('id', current.id)
        .select('*')
        .maybeSingle();
      if (error || data === null) {
        if (uploaded) await this.removeQuietly(COVERS, uploaded);
        throw error ?? new RepositoryError('forbidden', NO_PERMISSION);
      }
      const previous = current.cover_image_path;
      if (coverPath !== undefined && previous !== null && previous !== coverPath) {
        await this.removeQuietly(COVERS, previous);
      }
      return mapProject(data, await this.coverUrl(data.cover_image_path));
    });
  }

  /**
   * `delete_project` checks visibility and the owner role, deletes the project (cascading to its
   * schedules and their shares) and returns the stored objects; they are removed afterwards, one
   * call per bucket, and a failed removal is ignored (R12; SQL can't delete storage objects, V7).
   */
  async deleteProject(projectId: ID): Promise<void> {
    return this.run(async () => {
      const { data, error } = await this.client.rpc('delete_project', {
        p_project_id: asUuid(projectId),
      });
      if (error) throw toRepositoryError(error, { notFound: PROJECT_NOT_FOUND });
      const byBucket = new Map<string, string[]>();
      for (const { bucket, path } of data) {
        byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
      }
      await Promise.all(
        [...byBucket].map(([bucket, paths]) => this.removeQuietly(bucket, ...paths)),
      );
    });
  }

  async createSchedule(input: NewScheduleInput): Promise<Schedule> {
    return this.run(async () => {
      const project = await this.projectRef(input.projectId);
      const { data, error } = await this.client
        .from('schedules')
        .insert({
          project_id: project.id,
          name: input.name.trim(),
          code: input.code.trim(),
          source: 'blank',
        })
        .select('id')
        .single();
      if (error) throw error;
      return this.scheduleItem(data.id);
    });
  }

  async importSchedule(input: ImportScheduleInput): Promise<Schedule> {
    return this.run(async () => {
      const { file } = input;
      const stored = interimImportFormat(file.name);
      if (!stored) throw new RepositoryError('validation', 'Use a .xer, .xml or .csv file.');
      const project = await this.projectRef(input.projectId);
      const { gzipSync } = await import('fflate');
      const bytes = gzipSync(new Uint8Array(await file.arrayBuffer()));
      const path = `${project.workspace_id}/${project.id}/${crypto.randomUUID()}.${stored.suffix}`;
      const upload = await this.client.storage.from(IMPORTS).upload(path, bytes, {
        contentType: 'application/gzip',
        upsert: false,
      });
      if (upload.error) throw upload.error;
      const { data, error } = await this.client
        .from('schedules')
        .insert({
          project_id: project.id,
          name: input.name.trim(),
          code: input.code.trim(),
          source: 'import',
          source_format: stored.format,
          source_file_name: file.name,
          source_file_path: path,
          source_file_size: file.size,
        })
        .select('id')
        .single();
      if (error) {
        await this.removeQuietly(IMPORTS, path);
        throw error;
      }
      return this.scheduleItem(data.id);
    });
  }

  async listSchedules(projectId: ID): Promise<Schedule[]> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from('schedule_items')
        .select('*')
        .eq('project_id', asUuid(projectId))
        .order('status_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id');
      if (error) throw error;
      return data.map(mapScheduleItem);
    });
  }

  /**
   * `update_schedule_details` checks the schedule (R9's copy when it can't be read), the role and
   * the code, and saves in one update (R5 by trigger); the saved row is read back afterwards. Text
   * is trimmed here as the mock trims it (Postgres `trim` removes spaces only).
   */
  async updateScheduleDetails(input: UpdateScheduleDetailsInput): Promise<Schedule> {
    return this.run(async () => {
      const scheduleId = asUuid(input.scheduleId);
      const { error } = await this.client.rpc('update_schedule_details', {
        p_schedule_id: scheduleId,
        p_name: input.name.trim(),
        p_code: input.code.trim(),
        // The generated types mark every argument as required text or number; these three take
        // null, which clears the value.
        p_status_date: input.statusDate as string,
        p_notes: (input.notes?.trim() ?? null) as string,
        p_baseline: input.baseline,
        p_update_number: input.updateNumber as number,
      });
      if (error) throw error;
      return this.scheduleItem(scheduleId);
    });
  }

  async setCurrentSchedule(scheduleId: ID): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client.rpc('set_current_schedule', {
        p_schedule_id: asUuid(scheduleId),
      });
      if (error) throw error;
    });
  }

  async listSharedWithMe(): Promise<SharedScheduleRow[]> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from('shared_with_me')
        .select('*')
        .order('shared_at', { ascending: false })
        .order('share_id', { ascending: true });
      if (error) throw error;
      return data.map(mapSharedRow);
    });
  }

  async listPendingTasks(): Promise<Task[]> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from('tasks')
        .select('*')
        .eq('done', false)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data.map(mapTask);
    });
  }

  async setTaskDone(taskId: ID, done: boolean): Promise<Task> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from('tasks')
        .update({ done })
        .eq('id', asUuid(taskId))
        .select('*')
        .maybeSingle();
      if (error) throw toRepositoryError(error, { notFound: TASK_NOT_FOUND });
      if (data === null) throw new RepositoryError('not_found', TASK_NOT_FOUND);
      return mapTask(data);
    });
  }

  async listMembers(workspaceId: ID): Promise<WorkspaceMember[]> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from('workspace_members')
        .select('user_id, role, joined_at, profiles(first_name, last_name, email)')
        .eq('workspace_id', asUuid(workspaceId));
      if (error) throw error;
      return data
        .flatMap((row) => {
          const { profiles } = row;
          return profiles ? [mapMember({ ...row, profiles })] : [];
        })
        .sort(compareMembers);
    });
  }

  async listInvitations(workspaceId: ID): Promise<WorkspaceInvitation[]> {
    return this.run(async () => {
      const { data, error } = await this.client
        .from('workspace_invitations')
        .select('*')
        .eq('workspace_id', asUuid(workspaceId))
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
      if (error) throw error;
      return data.map(mapInvitation);
    });
  }

  async inviteMember(input: { workspaceId: ID; email: string; role: Role }): Promise<InviteResult> {
    const data = await this.invoke({
      action: 'invite',
      workspaceId: asUuid(input.workspaceId),
      email: input.email,
      role: input.role,
    });
    const status = typeof data === 'object' && data !== null && 'status' in data && data.status;
    if (status !== 'added' && status !== 'invited') {
      throw new RepositoryError('unknown', 'Something went wrong. Please try again.');
    }
    return { status };
  }

  async revokeInvitation(invitationId: ID): Promise<void> {
    await this.invoke({ action: 'revoke', invitationId: asUuid(invitationId) });
  }

  async updateMemberRole(input: { workspaceId: ID; userId: ID; role: Role }): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client.rpc('update_member_role', {
        p_workspace_id: asUuid(input.workspaceId),
        p_user_id: asUuid(input.userId),
        p_role: input.role,
      });
      if (error) throw error;
    });
  }

  async removeMember(input: { workspaceId: ID; userId: ID }): Promise<void> {
    return this.run(async () => {
      const { error } = await this.client.rpc('remove_member', {
        p_workspace_id: asUuid(input.workspaceId),
        p_user_id: asUuid(input.userId),
      });
      if (error) throw error;
    });
  }

  async updateProfile(input: { firstName: string; lastName: string }): Promise<User> {
    return this.run(async () => {
      const userId = await this.sessionUserId();
      const { data, error } = await this.client
        .from('profiles')
        .update({ first_name: input.firstName.trim(), last_name: input.lastName.trim() })
        .eq('id', userId)
        .select('*')
        .single();
      if (error) throw toRepositoryError(error, { notFound: 'User not found' });
      return mapUser(data);
    });
  }

  /** Runs `op` and turns anything it throws into a `RepositoryError`. */
  private async run<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      throw toRepositoryError(error);
    }
  }

  /** The signed-in user's id; without a session, `unauthorized`. */
  private async sessionUserId(): Promise<ID> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    const userId = data.session?.user.id;
    if (!userId) throw new RepositoryError('unauthorized', SESSION_EXPIRED);
    return userId;
  }

  /** The project's id and workspace, or `not_found` "Project not found". */
  private async projectRef(projectId: ID): Promise<{ id: ID; workspace_id: ID }> {
    const { data, error } = await this.client
      .from('projects')
      .select('id, workspace_id')
      .eq('id', asUuid(projectId))
      .maybeSingle();
    if (error) throw toRepositoryError(error, { notFound: PROJECT_NOT_FOUND });
    if (data === null) throw new RepositoryError('not_found', PROJECT_NOT_FOUND);
    return data;
  }

  /** One schedule as `schedule_items` shows it, read after a write. */
  private async scheduleItem(scheduleId: ID): Promise<Schedule> {
    const { data, error } = await this.client
      .from('schedule_items')
      .select('*')
      .eq('id', scheduleId)
      .single();
    if (error) throw error;
    return mapScheduleItem(data);
  }

  /** A signed URL for the cover at `path`, or `null` without a cover. */
  private async coverUrl(path: string | null): Promise<string | null> {
    if (path === null) return null;
    return (await this.signedUrls.urlsFor(COVERS, [path])).get(path) ?? null;
  }

  /** The workspace's project summaries, latest update first (ties by id), with signed covers. */
  private async projectSummaries(workspaceId: ID, limit: number | null): Promise<ProjectSummary[]> {
    return this.run(async () => {
      let query = this.client
        .from('project_summaries')
        .select('*')
        .eq('workspace_id', asUuid(workspaceId))
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true });
      if (limit !== null) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      const paths = data.flatMap((row) => (row.cover_image_path ? [row.cover_image_path] : []));
      const urls = paths.length > 0 ? await this.signedUrls.urlsFor(COVERS, paths) : new Map();
      return data.map((row) =>
        mapProjectSummary(
          row,
          row.cover_image_path ? (urls.get(row.cover_image_path) ?? null) : null,
        ),
      );
    });
  }

  /** Calls the `invitations` Edge Function; its errors go through `functionError`. */
  private async invoke(body: Record<string, unknown>): Promise<unknown> {
    let result: Awaited<ReturnType<AppSupabaseClient['functions']['invoke']>>;
    try {
      result = await this.client.functions.invoke('invitations', { body });
    } catch (error) {
      throw await functionError(error);
    }
    if (result.error) throw await functionError(result.error);
    return result.data;
  }

  /**
   * Best-effort removal, in one call, of objects nothing points at any more; its own errors are
   * ignored.
   */
  private async removeQuietly(bucket: string, ...paths: string[]): Promise<void> {
    try {
      await this.client.storage.from(bucket).remove(paths);
    } catch {
      // The objects stay; nothing points at them.
    }
  }
}
