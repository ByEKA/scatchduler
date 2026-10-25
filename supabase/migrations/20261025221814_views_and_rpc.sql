-- Read views and public RPCs (P2 spec §6.5, §6.6, §7.2). The views are security_invoker, so the
-- caller's table policies apply; auth.uid() is written (select auth.uid()) so it runs once.

create view public.project_summaries with (security_invoker = true) as
  select p.*, (select count(*) from public.schedules s where s.project_id = p.id)::int as schedule_count
  from public.projects p;

create view public.workspace_summaries with (security_invoker = true) as
  select w.*,
         (select count(*) from public.projects p where p.workspace_id = w.id)::int as project_count,
         (select m.role from public.workspace_members m
          where m.workspace_id = w.id and m.user_id = (select auth.uid())) as my_role
  from public.workspaces w;

create view public.shared_with_me with (security_invoker = true) as
  select sh.id as share_id, s.id as schedule_id, s.name as schedule_name, s.status_date,
         p.id as project_id, p.name as project_name, p.workspace_id,
         pr.id as shared_by_id, pr.first_name as shared_by_first_name,
         pr.last_name as shared_by_last_name, pr.avatar_url as shared_by_avatar_url,
         sh.shared_at
  from public.schedule_shares sh
  join public.schedules s on s.id = sh.schedule_id
  join public.projects p on p.id = s.project_id
  join public.profiles pr on pr.id = sh.shared_by
  where sh.shared_with = (select auth.uid());

-- View grants: signed-in users read; the service role keeps full privileges (§6.7).
revoke all on public.project_summaries, public.workspace_summaries, public.shared_with_me from anon, authenticated;
grant select on public.project_summaries, public.workspace_summaries, public.shared_with_me to authenticated;
grant all on public.project_summaries, public.workspace_summaries, public.shared_with_me to service_role;

-- Creates a team workspace owned by the caller and returns its summary.
create function public.create_team_workspace(p_name text) returns public.workspace_summaries
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_workspace_id uuid;
  v_summary public.workspace_summaries;
begin
  if v_user_id is null then
    raise exception using errcode = 'insufficient_privilege', message = 'Sign in to create a workspace.';
  end if;
  if char_length(v_name) not between 2 and 40 then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Use 2–40 characters';
  end if;

  insert into public.workspaces (name, kind, created_by)
  values (v_name, 'team', v_user_id)
  returning id into v_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_user_id, 'owner');

  select * into v_summary from public.workspace_summaries ws where ws.id = v_workspace_id;
  return v_summary;
end
$$;

-- Codes compare trimmed and case-insensitively; no LIKE, so an underscore is a literal character.
-- Invoker: the caller only learns about codes in workspaces they can read.
create function public.is_project_code_available(p_workspace_id uuid, p_code text) returns boolean
language sql stable set search_path = '' as $$
  select not exists (
    select 1 from public.projects p
    where p.workspace_id = p_workspace_id
      and lower(p.code) = lower(trim(p_code))
  )
$$;

-- Changes a member's role. Owners only; at least one owner always remains.
create function public.update_member_role(p_workspace_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_current_role text;
begin
  if (select auth.uid()) is null or not app.has_role(p_workspace_id, 'owner') then
    raise exception using errcode = 'insufficient_privilege', message = 'Only workspace owners can change members.';
  end if;

  -- Lock the workspace's member rows, so two owners demoting each other can't both succeed.
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id for update;

  select m.role into v_current_role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  if not found then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'This person is no longer a member.';
  end if;

  if v_current_role = 'owner' and p_role is distinct from 'owner' and (
    select count(*) from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.role = 'owner'
  ) <= 1 then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'A workspace needs at least one owner.';
  end if;

  update public.workspace_members m
  set role = p_role
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
end
$$;

-- Removes a member. Owners only; at least one owner always remains.
create function public.remove_member(p_workspace_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_current_role text;
begin
  if (select auth.uid()) is null or not app.has_role(p_workspace_id, 'owner') then
    raise exception using errcode = 'insufficient_privilege', message = 'Only workspace owners can change members.';
  end if;

  -- Lock the workspace's member rows, so two owners removing each other can't both succeed.
  perform 1 from public.workspace_members m where m.workspace_id = p_workspace_id for update;

  select m.role into v_current_role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
  if not found then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'This person is no longer a member.';
  end if;

  if v_current_role = 'owner' and (
    select count(*) from public.workspace_members m
    where m.workspace_id = p_workspace_id and m.role = 'owner'
  ) <= 1 then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'A workspace needs at least one owner.';
  end if;

  delete from public.workspace_members m
  where m.workspace_id = p_workspace_id and m.user_id = p_user_id;
end
$$;

-- Privileges: new functions are executable by PUBLIC until revoked (Task 9 step 2).
revoke all on function public.create_team_workspace(text), public.is_project_code_available(uuid, text),
  public.update_member_role(uuid, uuid, text), public.remove_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_team_workspace(text), public.is_project_code_available(uuid, text),
  public.update_member_role(uuid, uuid, text), public.remove_member(uuid, uuid) to authenticated;
