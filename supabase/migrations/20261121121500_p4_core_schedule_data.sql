-- Phase 4 core: schedule document snapshots, exclusive version locks and storage policies
-- (P4 core spec §4.3 R1–R12, §4.4). Earlier migrations are never edited.

-- 1. Private storage bucket for gzipped ScheduleDocument JSON snapshots (R8).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('schedule-data', 'schedule-data', false, 20971520, array['application/gzip']);

-- 2. Snapshot, mode and lock columns on public.schedules (§4.4).
alter table public.schedules
  add column data_file_path text,
  add column data_revision int not null default 0 check (data_revision >= 0),
  add column calculation_mode text not null default 'calculated'
    check (calculation_mode in ('as_imported', 'calculated')),
  add column locked_by uuid references auth.users (id) on delete set null,
  add column locked_at timestamptz,
  add column lock_expires_at timestamptz,
  add constraint schedules_lock_triplet_check
    check ((locked_by is null) = (locked_at is null) and (locked_by is null) = (lock_expires_at is null));

create unique index schedules_data_file_path_uq on public.schedules (data_file_path)
  where data_file_path is not null;

-- Keep schedules_lock_triplet_check valid if a lock holder's auth.users row is deleted (on delete set null).
create function app.clear_orphaned_schedule_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.locked_by is null then
    new.locked_at := null;
    new.lock_expires_at := null;
  end if;
  return new;
end
$$;

create trigger schedules_clear_orphaned_lock
  before update of locked_by on public.schedules
  for each row execute function app.clear_orphaned_schedule_lock();

-- 3. Privacy-scoped display name helper for active lock holders (used by schedule_items and lock RPCs).
create function app.display_name(p_user_id uuid) returns text
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
  select coalesce(
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    nullif(trim(p.email), ''),
    'Another user'
  )
  into v_name
  from public.profiles p
  where p.id = p_user_id;
  return coalesce(v_name, 'Another user');
end
$$;

-- 4. Insert trigger: keep P3 core checks plus R8 validation for initial data_file_path.
create or replace function app.prepare_new_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_suffix text;
begin
  new.id := coalesce(new.id, gen_random_uuid());
  if v_user_id is not null and new.project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can add schedules to this project.';
  end if;
  select p.workspace_id into v_workspace_id
  from public.projects p
  where p.id = new.project_id
  for update;
  new.is_current := not exists (select 1 from public.schedules s where s.project_id = new.project_id);
  if v_user_id is not null and nullif(trim(new.code), '') is null then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Enter a schedule code.';
  end if;
  if v_user_id is not null and new.source_file_path is not null then
    v_suffix := case new.source_format
      when 'xer' then 'xer\.gz'
      when 'mspdi' then 'xml\.gz'
      when 'csv' then 'csv\.gz'
      when 'xlsx' then 'xlsx'
    end;
    if v_suffix is null or v_workspace_id is null
       or new.source_file_path !~ (
         '^' || v_workspace_id || '/' || new.project_id
         || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.' || v_suffix || '$'
       ) then
      raise exception using errcode = 'check_violation',
        message = 'The stored file path doesn''t match the schedule.';
    end if;
  end if;
  if v_user_id is not null and new.data_file_path is not null then
    if v_workspace_id is null
       or new.data_file_path !~ (
         '^' || v_workspace_id || '/' || new.project_id || '/' || new.id
         || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json\.gz$'
       ) then
      raise exception using errcode = 'check_violation',
        message = 'The stored schedule data path doesn''t match the schedule.';
    end if;
  end if;
  if new.data_file_path is not null and new.data_revision = 0 then
    new.data_revision := 1;
  end if;
  return new;
end
$$;

-- 5. Recreate schedule_items with revision, snapshot presence, mode and active lock columns.
drop view public.schedule_items;
create view public.schedule_items with (security_invoker = true) as
  select s.id, s.project_id, s.name, s.code, s.notes, s.status_date, s.source, s.source_format,
         s.source_file_name, s.is_current, s.baseline, s.update_number, s.archived_at,
         s.activity_count, s.import_report is not null as has_import_report,
         s.import_mapping is not null as has_import_mapping,
         s.data_revision,
         s.data_file_path is not null as has_schedule_data,
         s.calculation_mode,
         case when s.lock_expires_at > now() then s.locked_by end as locked_by,
         case when s.lock_expires_at > now() then app.display_name(s.locked_by) end as locked_by_name,
         case when s.lock_expires_at > now() then s.locked_at end as locked_at,
         case when s.lock_expires_at > now() then s.lock_expires_at end as lock_expires_at,
         s.created_at, s.updated_at
  from public.schedules s;

revoke all on public.schedule_items from anon, authenticated;
grant select on public.schedule_items to authenticated;
grant all on public.schedule_items to service_role;

-- 6. Grants: new imports may set id, initial data_file_path and calculation_mode on insert only (R10).
grant insert (id, data_file_path, calculation_mode) on public.schedules to authenticated;

-- 7. Six new security definer RPCs for locks, materialization and saving (R1–R8).

create function public.acquire_schedule_lock(p_schedule_id uuid)
returns table (user_id uuid, user_name text, locked_at timestamptz, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_project_id uuid;
  v_archived_at timestamptz;
  v_locked_by uuid;
  v_lock_expires_at timestamptz;
  v_now timestamptz := now();
  v_expires timestamptz := v_now + interval '15 minutes';
begin
  select s.project_id, s.archived_at, s.locked_by, s.lock_expires_at
  into v_project_id, v_archived_at, v_locked_by, v_lock_expires_at
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
  if v_archived_at is not null then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Restore this schedule before editing it.';
  end if;
  if v_locked_by is not null and v_locked_by <> v_caller and v_lock_expires_at > v_now then
    raise exception using errcode = 'serialization_failure', hint = 'app',
      message = 'This schedule is being edited by ' || app.display_name(v_locked_by) || '.';
  end if;

  update public.schedules s
  set locked_by = v_caller,
      locked_at = v_now,
      lock_expires_at = v_expires
  where s.id = p_schedule_id;

  return query select v_caller, app.display_name(v_caller), v_now, v_expires;
end
$$;

create function public.renew_schedule_lock(p_schedule_id uuid)
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
      message = 'Your edit lock expired. Copy your changes or reload the schedule.';
  end if;

  update public.schedules s
  set lock_expires_at = v_expires
  where s.id = p_schedule_id;

  return query select v_caller, app.display_name(v_caller), v_locked_at, v_expires;
end
$$;

create function public.release_schedule_lock(p_schedule_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_project_id uuid;
begin
  select s.project_id into v_project_id
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

  update public.schedules s
  set locked_by = null, locked_at = null, lock_expires_at = null
  where s.id = p_schedule_id and s.locked_by = v_caller;
end
$$;

create function public.force_release_schedule_lock(p_schedule_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_project_id uuid;
begin
  select s.project_id into v_project_id
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
  if v_project_id not in (select app.my_project_ids('owner')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only workspace owners can unlock another user''s schedule.';
  end if;

  update public.schedules s
  set locked_by = null, locked_at = null, lock_expires_at = null
  where s.id = p_schedule_id;
end
$$;

create function public.materialize_schedule_data(
  p_schedule_id uuid,
  p_data_file_path text,
  p_activity_count int,
  p_calculation_mode text
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_caller uuid := (select auth.uid());
  v_project_id uuid;
  v_workspace_id uuid;
  v_existing_path text;
  v_existing_rev int;
begin
  select s.project_id, p.workspace_id, s.data_file_path, s.data_revision
  into v_project_id, v_workspace_id, v_existing_path, v_existing_rev
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
      message = 'Only editors and owners can prepare schedule data.';
  end if;
  if p_data_file_path is null
     or p_data_file_path !~ (
       '^' || v_workspace_id || '/' || v_project_id || '/' || p_schedule_id
       || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json\.gz$'
     ) then
    raise exception using errcode = 'check_violation',
      message = 'The stored schedule data path doesn''t match the schedule.';
  end if;
  if v_existing_path is not null then
    return v_existing_rev;
  end if;

  -- None of these columns are in schedules_set_updated_at, so updated_at stays unchanged (R7).
  update public.schedules s
  set data_file_path = p_data_file_path,
      data_revision = 1,
      activity_count = p_activity_count,
      calculation_mode = p_calculation_mode
  where s.id = p_schedule_id;

  return 1;
end
$$;

create function public.save_schedule_data(
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
      message = 'Your edit lock expired. Copy your changes or reload the schedule.';
  end if;
  if v_current_rev <> p_expected_revision then
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

-- 8. R11: guard update_schedule_details (status_date change) and set_schedules_archived (archive)
-- while another user holds an active lock.
create or replace function public.update_schedule_details(
  p_schedule_id uuid, p_name text, p_code text, p_status_date date, p_notes text,
  p_baseline text, p_update_number int
) returns void
language plpgsql set search_path = '' as $$
declare
  v_project_id uuid;
  v_old_status_date date;
  v_locked_by uuid;
  v_lock_expires_at timestamptz;
  v_updated int;
begin
  select s.project_id, s.status_date, s.locked_by, s.lock_expires_at
  into v_project_id, v_old_status_date, v_locked_by, v_lock_expires_at
  from public.schedules s
  where s.id = p_schedule_id;
  if not found then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Some schedules are no longer available. Refresh and try again.';
  end if;
  if v_project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can change schedules.';
  end if;
  if nullif(trim(p_code), '') is null then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Enter a schedule code.';
  end if;
  if p_status_date is distinct from v_old_status_date
     and v_locked_by is not null
     and v_locked_by <> (select auth.uid())
     and v_lock_expires_at > now() then
    raise exception using errcode = 'serialization_failure', hint = 'app',
      message = 'This schedule is being edited by ' || app.display_name(v_locked_by) || '. Try again once they finish.';
  end if;

  update public.schedules s
  set name = trim(p_name),
      code = trim(p_code),
      status_date = p_status_date,
      notes = nullif(trim(p_notes), ''),
      baseline = p_baseline,
      update_number = p_update_number
  where s.id = p_schedule_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can change schedules.';
  end if;
end
$$;

create or replace function public.set_schedules_archived(p_schedule_ids uuid[], p_archived boolean)
returns void
language plpgsql set search_path = '' as $$
declare
  v_ids uuid[];
  v_projects uuid[];
  v_found int;
  v_locked_by uuid;
  v_updated int;
begin
  select coalesce(array_agg(distinct i), '{}') into v_ids from unnest(p_schedule_ids) as i;
  if cardinality(v_ids) = 0 then
    return;
  end if;
  if cardinality(v_ids) > 500 then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Select 500 schedules or fewer.';
  end if;
  select coalesce(array_agg(distinct s.project_id), '{}'), count(*) into v_projects, v_found
  from public.schedules s
  where s.id = any(v_ids);
  if cardinality(v_projects) > 1 then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Select schedules from one project.';
  end if;
  if v_found <> cardinality(v_ids) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Some schedules are no longer available. Refresh and try again.';
  end if;
  if v_projects[1] not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can archive or restore schedules.';
  end if;
  if p_archived then
    select s.locked_by into v_locked_by
    from public.schedules s
    where s.id = any(v_ids)
      and s.locked_by is not null
      and s.locked_by <> (select auth.uid())
      and s.lock_expires_at > now()
    limit 1;
    if v_locked_by is not null then
      raise exception using errcode = 'serialization_failure', hint = 'app',
        message = 'This schedule is being edited by ' || app.display_name(v_locked_by) || '. Try again once they finish.';
    end if;
  end if;

  update public.schedules s
  set archived_at = case when p_archived then coalesce(s.archived_at, now()) end
  where s.id = any(v_ids);
  get diagnostics v_updated = row_count;
  if v_updated <> cardinality(v_ids) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can archive or restore schedules.';
  end if;
end
$$;

-- 9. R9: delete_schedules and delete_project return paths from schedule-imports, schedule-data and project-covers.
drop function public.delete_schedules(uuid[]);
create function public.delete_schedules(p_schedule_ids uuid[])
returns table (bucket text, path text)
language plpgsql set search_path = '' as $$
declare
  v_ids uuid[];
  v_projects uuid[];
  v_found int;
  v_deleted int;
  v_import_paths text[];
  v_data_paths text[];
begin
  select coalesce(array_agg(distinct i), '{}') into v_ids from unnest(p_schedule_ids) as i;
  if cardinality(v_ids) = 0 then
    return;
  end if;
  if cardinality(v_ids) > 500 then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Select 500 schedules or fewer.';
  end if;
  select coalesce(array_agg(distinct s.project_id), '{}'), count(*) into v_projects, v_found
  from public.schedules s
  where s.id = any(v_ids);
  if cardinality(v_projects) > 1 then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Select schedules from one project.';
  end if;
  if v_found <> cardinality(v_ids) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Some schedules are no longer available. Refresh and try again.';
  end if;
  if v_projects[1] not in (select app.my_project_ids('owner')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only workspace owners can delete schedules.';
  end if;

  with deleted as (
    delete from public.schedules s
    where s.id = any(v_ids)
    returning s.source_file_path, s.data_file_path
  )
  select
    count(*),
    array_agg(d.source_file_path) filter (where d.source_file_path is not null),
    array_agg(d.data_file_path) filter (where d.data_file_path is not null)
  into v_deleted, v_import_paths, v_data_paths
  from deleted d;
  if v_deleted <> cardinality(v_ids) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only workspace owners can delete schedules.';
  end if;

  return query
    select 'schedule-imports'::text, p from unnest(coalesce(v_import_paths, '{}'::text[])) as p
    union all
    select 'schedule-data'::text, p from unnest(coalesce(v_data_paths, '{}'::text[])) as p;
end
$$;

create or replace function public.delete_project(p_project_id uuid)
returns table (bucket text, path text)
language plpgsql set search_path = '' as $$
declare
  v_deleted int;
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id) then
    raise exception using errcode = 'no_data_found', hint = 'app', message = 'Project not found';
  end if;
  if p_project_id not in (select app.my_project_ids('owner')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only workspace owners can delete projects.';
  end if;
  perform 1 from public.projects p where p.id = p_project_id for update;

  return query
    select 'schedule-imports'::text, s.source_file_path
    from public.schedules s
    where s.project_id = p_project_id and s.source_file_path is not null
    union all
    select 'schedule-data'::text, s.data_file_path
    from public.schedules s
    where s.project_id = p_project_id and s.data_file_path is not null
    union all
    select 'project-covers'::text, p.cover_image_path
    from public.projects p
    where p.id = p_project_id and p.cover_image_path is not null;

  delete from public.projects p where p.id = p_project_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only workspace owners can delete projects.';
  end if;
end
$$;

-- 10. Storage RLS on schedule-data (R12, V5).
-- SELECT uses invoker RLS on public.schedules so both workspace members and share recipients read
-- snapshots for schedules they can select.
create policy schedule_data_select on storage.objects for select to authenticated
  using (
    bucket_id = 'schedule-data'
    and (
      exists (select 1 from public.schedules s where s.data_file_path = objects.name)
      or (
        (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
        and owner_id = (select auth.uid())::text
      )
    )
  );

create policy schedule_data_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'schedule-data'
    and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
  );

create policy schedule_data_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'schedule-data'
    and (
      (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('owner') as id)
      or (
        (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
        and owner_id = (select auth.uid())::text
        and not exists (select 1 from public.schedules s where s.data_file_path = objects.name)
      )
    )
  );

-- 11. Privileges: revoke PUBLIC execute on every created or replaced function, then grant explicitly.
revoke execute on function
  app.clear_orphaned_schedule_lock(),
  app.display_name(uuid),
  app.prepare_new_schedule(),
  public.acquire_schedule_lock(uuid),
  public.renew_schedule_lock(uuid),
  public.release_schedule_lock(uuid),
  public.force_release_schedule_lock(uuid),
  public.materialize_schedule_data(uuid, text, int, text),
  public.save_schedule_data(uuid, int, text, int, text, date),
  public.update_schedule_details(uuid, text, text, date, text, text, int),
  public.set_schedules_archived(uuid[], boolean),
  public.delete_schedules(uuid[]),
  public.delete_project(uuid)
from public, anon, authenticated;

grant execute on function
  app.display_name(uuid),
  public.acquire_schedule_lock(uuid),
  public.renew_schedule_lock(uuid),
  public.release_schedule_lock(uuid),
  public.force_release_schedule_lock(uuid),
  public.materialize_schedule_data(uuid, text, int, text),
  public.save_schedule_data(uuid, int, text, int, text, date),
  public.update_schedule_details(uuid, text, text, date, text, text, int),
  public.set_schedules_archived(uuid[], boolean),
  public.delete_schedules(uuid[]),
  public.delete_project(uuid)
to authenticated;
