-- Fixes after the review of PRs #1-#6: folder delete renames clashing moved children (P4 later D5),
-- R11 runs in the schedules update trigger so direct writes obey the lock (P4 core R11, P3 core D13),
-- a NULL expected revision is a stale one (P4 core R5), display names never fall back to the email,
-- and the lock-lost copy reads "Download your changes" (P4 core D16). Earlier migrations are never edited.

-- 1. D5: deleting a folder always succeeds. Moved children whose names clash at the parent level,
-- or with the deleted folder itself, take the lowest free "{name} (n)" (R3, R4).
create or replace function public.delete_folder(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project_id uuid;
  v_parent_id uuid;
  v_taken text[];
  v_child record;
  v_n int;
  v_suffix text;
  v_name text;
begin
  select f.project_id, f.parent_id into v_project_id, v_parent_id
  from public.folders f
  where f.id = p_folder_id
    and f.project_id in (select app.my_project_ids('viewer'))
  for update;
  if not found then
    raise exception using errcode = 'no_data_found', hint = 'app',
      message = 'Folder not found';
  end if;
  if v_project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can manage folders.';
  end if;

  -- D5: names already taken at the parent level (the deleted folder's own included) and by the
  -- moved children; a clashing child takes the lowest free "{name} (n)", cut to fit 80 characters.
  select coalesce(array_agg(lower(trim(f.name))), '{}') into v_taken
  from public.folders f
  where f.project_id = v_project_id
    and (f.parent_id is not distinct from v_parent_id or f.parent_id = p_folder_id);

  for v_child in
    select c.id, trim(c.name) as base
    from public.folders c
    where c.parent_id = p_folder_id
      and exists (
        select 1 from public.folders s
        where s.project_id = v_project_id
          and s.parent_id is not distinct from v_parent_id
          and lower(trim(s.name)) = lower(trim(c.name))
      )
    order by c.created_at, c.id
  loop
    v_n := 2;
    loop
      v_suffix := ' (' || v_n || ')';
      v_name := rtrim(left(v_child.base, 80 - char_length(v_suffix))) || v_suffix;
      exit when not (lower(v_name) = any (v_taken));
      v_n := v_n + 1;
    end loop;
    v_taken := v_taken || lower(v_name);
    update public.folders f set name = v_name where f.id = v_child.id;
  end loop;

  update public.folders f set parent_id = v_parent_id where f.parent_id = p_folder_id;
  update public.schedules s set folder_id = v_parent_id where s.folder_id = p_folder_id;
  delete from public.folders f where f.id = p_folder_id;
end
$$;

-- 2. Update guards for user calls: R11 first, then R4, R2 and R8 as before. Archiving or changing
-- status_date while another user holds an active lock is refused for direct writes too (P3 core D13).
create or replace function app.guard_schedule_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null then
    return new;
  end if;
  if old.locked_by is not null
     and old.locked_by <> v_caller
     and old.lock_expires_at > now()
     and ((old.archived_at is null and new.archived_at is not null)
          or new.status_date is distinct from old.status_date) then
    raise exception using errcode = 'serialization_failure', hint = 'app',
      message = 'This schedule is being edited by ' || app.display_name(old.locked_by) || '. Try again once they finish.';
  end if;
  if not old.is_current and new.is_current and new.archived_at is not null then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Restore this schedule before making it current.';
  end if;
  if new.is_current and new.archived_at is not null then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Make another schedule current before archiving this one.';
  end if;
  if old.code is not null and new.code is null then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Enter a schedule code.';
  end if;
  return new;
end
$$;

-- 3. Display name: trimmed first and last name, else 'Another user'; the email is never read.
create or replace function app.display_name(p_user_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_name text;
begin
  if p_user_id is null then
    return null;
  end if;
  if v_caller is not null and p_user_id <> v_caller then
    if not exists (
      select 1
      from public.workspace_members m
      where m.user_id = p_user_id
        and m.workspace_id in (select app.my_workspace_ids('viewer'))
    ) and not exists (
      select 1
      from public.schedules s
      join public.schedule_shares sh on sh.schedule_id = s.id
      where s.locked_by = p_user_id
        and sh.shared_with = v_caller
    ) then
      return 'Another user';
    end if;
  end if;
  select nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '')
  into v_name
  from public.profiles p
  where p.id = p_user_id;
  return coalesce(v_name, 'Another user');
end
$$;

-- 4. R5: a NULL expected revision is a stale one; the lock-lost copy follows D16.
create or replace function public.save_schedule_data(
  p_schedule_id uuid,
  p_expected_revision int,
  p_data_file_path text,
  p_activity_count int,
  p_calculation_mode text,
  p_status_date date
) returns table (data_revision int, previous_data_file_path text)
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_project_id uuid;
  v_workspace_id uuid;
  v_archived_at timestamptz;
  v_locked_by uuid;
  v_lock_expires_at timestamptz;
  v_prev_path text;
  v_current_rev int;
  v_next_rev int;
begin
  select s.project_id, p.workspace_id, s.archived_at, s.locked_by, s.lock_expires_at,
         s.data_file_path, s.data_revision
  into v_project_id, v_workspace_id, v_archived_at, v_locked_by, v_lock_expires_at,
       v_prev_path, v_current_rev
  from public.schedules s
  join public.projects p on p.id = s.project_id
  where s.id = p_schedule_id
    and (
      s.project_id in (select app.my_project_ids('viewer'))
      or exists (
        select 1 from public.schedule_shares sh
        where sh.schedule_id = s.id and sh.shared_with = v_caller
      )
    )
  for update of s;
  if not found then
    raise exception using errcode = 'no_data_found', hint = 'app', message = 'Schedule not found';
  end if;
  if v_project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can save schedules.';
  end if;
  if v_archived_at is not null then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Restore this schedule before editing it.';
  end if;
  if v_locked_by is distinct from v_caller or v_lock_expires_at is null or v_lock_expires_at <= now() then
    raise exception using errcode = 'serialization_failure', hint = 'app',
      message = 'Your edit lock expired. Download your changes or reload the schedule.';
  end if;
  if v_current_rev is distinct from p_expected_revision then
    raise exception using errcode = 'serialization_failure', hint = 'app',
      message = 'This schedule was changed elsewhere. Reload and try again.';
  end if;
  if p_data_file_path is null
     or p_data_file_path !~ (
       '^' || v_workspace_id || '/' || v_project_id || '/' || p_schedule_id
       || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json\.gz$'
     ) then
    raise exception using errcode = 'check_violation',
      message = 'The stored schedule data path doesn''t match the schedule.';
  end if;

  v_next_rev := v_current_rev + 1;
  update public.schedules s
  set data_file_path = p_data_file_path,
      data_revision = v_next_rev,
      activity_count = p_activity_count,
      calculation_mode = p_calculation_mode,
      status_date = p_status_date,
      updated_at = now()
  where s.id = p_schedule_id;

  return query select v_next_rev, v_prev_path;
end
$$;

-- 5. R2: the lock-lost copy follows D16.
create or replace function public.renew_schedule_lock(p_schedule_id uuid)
returns table (user_id uuid, user_name text, locked_at timestamptz, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_project_id uuid;
  v_locked_by uuid;
  v_locked_at timestamptz;
  v_lock_expires_at timestamptz;
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '15 minutes';
begin
  select s.project_id, s.locked_by, s.locked_at, s.lock_expires_at
  into v_project_id, v_locked_by, v_locked_at, v_lock_expires_at
  from public.schedules s
  where s.id = p_schedule_id
    and (
      s.project_id in (select app.my_project_ids('viewer'))
      or exists (
        select 1 from public.schedule_shares sh
        where sh.schedule_id = s.id and sh.shared_with = v_caller
      )
    )
  for update;
  if not found then
    raise exception using errcode = 'no_data_found', hint = 'app', message = 'Schedule not found';
  end if;
  if v_project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can edit schedules.';
  end if;
  if v_locked_by is distinct from v_caller or v_lock_expires_at is null or v_lock_expires_at <= v_now then
    raise exception using errcode = 'serialization_failure', hint = 'app',
      message = 'Your edit lock expired. Download your changes or reload the schedule.';
  end if;

  update public.schedules s
  set lock_expires_at = v_expires
  where s.id = p_schedule_id;

  return query select v_caller, app.display_name(v_caller), v_locked_at, v_expires;
end
$$;

-- 6. Privileges: revoke PUBLIC execute on every replaced function, then grant explicitly as before.
revoke execute on function
  public.delete_folder(uuid),
  app.guard_schedule_update(),
  app.display_name(uuid),
  public.save_schedule_data(uuid, int, text, int, text, date),
  public.renew_schedule_lock(uuid)
from public, anon, authenticated;

grant execute on function
  public.delete_folder(uuid),
  app.display_name(uuid),
  public.save_schedule_data(uuid, int, text, int, text, date),
  public.renew_schedule_lock(uuid)
to authenticated;
