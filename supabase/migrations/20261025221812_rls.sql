-- Row-level security policies (P2 spec §7.1). Every policy is written `to authenticated`; anon
-- has no grants at all. Policies compare against the helper sets, so the membership lookup runs
-- once per statement: (select auth.uid()), (select app.my_workspace_ids(<role>)) and
-- (select app.my_project_ids(<role>)).

-- profiles: my own row, people who share a workspace with me, people who shared a schedule with me.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.workspace_members m
      where m.workspace_id in (select app.my_workspace_ids('viewer'))
    )
    or id in (
      select s.shared_by from public.schedule_shares s
      where s.shared_with = (select auth.uid())
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- subscriptions: my own row.
create policy subscriptions_select_self on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- workspaces: my workspaces; owners rename them.
create policy workspaces_select on public.workspaces for select to authenticated
  using (id in (select app.my_workspace_ids('viewer')));
create policy workspaces_update_owner on public.workspaces for update to authenticated
  using (id in (select app.my_workspace_ids('owner')))
  with check (id in (select app.my_workspace_ids('owner')));

-- workspace_members: rows of my workspaces (changes go through the RPCs).
create policy members_select on public.workspace_members for select to authenticated
  using (workspace_id in (select app.my_workspace_ids('viewer')));

-- workspace_invitations: owners of the workspace (changes go through the Edge Function).
create policy invitations_select_owner on public.workspace_invitations for select to authenticated
  using (workspace_id in (select app.my_workspace_ids('owner')));

-- projects: my workspaces, or a project holding a schedule shared with me.
create policy projects_select on public.projects for select to authenticated
  using (
    workspace_id in (select app.my_workspace_ids('viewer'))
    or id in (
      select s.project_id from public.schedules s
      join public.schedule_shares sh on sh.schedule_id = s.id
      where sh.shared_with = (select auth.uid())
    )
  );
create policy projects_insert on public.projects for insert to authenticated
  with check (workspace_id in (select app.my_workspace_ids('editor')));
create policy projects_update on public.projects for update to authenticated
  using (workspace_id in (select app.my_workspace_ids('editor')))
  with check (workspace_id in (select app.my_workspace_ids('editor')));
create policy projects_delete on public.projects for delete to authenticated
  using (workspace_id in (select app.my_workspace_ids('owner')));

-- schedules: projects in my workspaces, or a share to me.
create policy schedules_select on public.schedules for select to authenticated
  using (
    project_id in (select app.my_project_ids('viewer'))
    or id in (
      select sh.schedule_id from public.schedule_shares sh
      where sh.shared_with = (select auth.uid())
    )
  );
create policy schedules_insert on public.schedules for insert to authenticated
  with check (project_id in (select app.my_project_ids('editor')));
create policy schedules_update on public.schedules for update to authenticated
  using (project_id in (select app.my_project_ids('editor')))
  with check (project_id in (select app.my_project_ids('editor')));
create policy schedules_delete on public.schedules for delete to authenticated
  using (project_id in (select app.my_project_ids('owner')));

-- schedule_shares: shares to me or by me; I share schedules I can edit.
create policy shares_select on public.schedule_shares for select to authenticated
  using (shared_with = (select auth.uid()) or shared_by = (select auth.uid()));
create policy shares_insert on public.schedule_shares for insert to authenticated
  with check (
    shared_by = (select auth.uid())
    and schedule_id in (
      select s.id from public.schedules s
      where s.project_id in (select app.my_project_ids('editor'))
    )
  );
create policy shares_delete on public.schedule_shares for delete to authenticated
  using (shared_by = (select auth.uid()));

-- tasks: my own; only done is updatable (column grant).
create policy tasks_select on public.tasks for select to authenticated
  using (assignee_id = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (assignee_id = (select auth.uid()))
  with check (assignee_id = (select auth.uid()));
