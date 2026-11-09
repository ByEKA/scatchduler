-- Phase 3 core: schedule rules (P3 core spec §4.3 R1–R11, §4.6–§4.8). P2 migrations are never
-- edited; this one adds the schedule columns (code, notes, current, baseline, update number,
-- archive, activity count), the triggers that keep R1–R8 and R11 for every write, the four
-- schedule RPCs, project_summaries with the current schedule, and the schedule_items view.
--
-- Trigger order. PostgreSQL fires triggers of the same timing in name order, so the names fix it:
--   before insert: schedules_apply_baseline → schedules_fill_status_date → schedules_prepare_new
--   before update: schedules_apply_baseline → schedules_guard_update → schedules_set_updated_at
--   after insert or update: schedules_sync_project_status_date (→ projects_guard_status_date)
--                           → schedules_touch_project (insert)
--   after delete, per statement: schedules_check_current_after_delete
-- The user guards run only when (select auth.uid()) is not null, so the seed loader (service
-- role) and migrations write freely; R5 and R6 hold for every caller.

-- project_summaries is recreated below with the current schedule.
drop view public.project_summaries;

-- 1. Columns, checks and indexes (§4.6).
alter table public.schedules
  add column code text check (code ~ '^[A-Za-z0-9_.-]{1,24}$'),
  add column notes text check (char_length(notes) <= 2000),
  add column is_current boolean not null default false,
  add column baseline text not null default 'none' check (baseline in ('none', 'baseline', 'primary')),
  add column update_number int check (update_number between 1 and 999),
  add column archived_at timestamptz,
  add column activity_count int not null default 0 check (activity_count between 0 and 20000),
  add check (not (is_current and archived_at is not null));

-- The error mapping reads these names (spec §4.11).
create unique index schedules_project_code_uq on public.schedules (project_id, lower(code))
  where code is not null;
create unique index schedules_one_current_uq on public.schedules (project_id) where is_current;
create unique index schedules_one_primary_uq on public.schedules (project_id)
  where baseline = 'primary';
create unique index schedules_project_update_uq on public.schedules (project_id, update_number);

-- 2. R11: updated_at follows writes that name a user-editable column, even with an unchanged
-- value; making a schedule current leaves it alone.
drop trigger schedules_set_updated_at on public.schedules;
create trigger schedules_set_updated_at
  before update of name, code, notes, status_date, baseline, update_number, archived_at
  on public.schedules
  for each row execute function app.set_updated_at();

-- 3. Insert: D35 role check, project lock, R1 (first schedule current), R8 (code required).
-- A definer before-insert trigger runs before RLS's insert check, so the role is checked here
-- first: a viewer or a share recipient gets 42501, as RLS would answer, never R8.
create function app.prepare_new_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is not null and new.project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can add schedules to this project.';
  end if;
  -- Serializes the project's inserts, so two first schedules can't both become current, and
  -- orders them with deletes, whose R3 check takes the same lock (check_current_after_delete).
  perform 1 from public.projects p where p.id = new.project_id for update;
  new.is_current := not exists (select 1 from public.schedules s where s.project_id = new.project_id);
  if v_user_id is not null and nullif(trim(new.code), '') is null then
    raise exception using errcode = 'check_violation', hint = 'app', message = 'Enter a schedule code.';
  end if;
  return new;
end
$$;

create trigger schedules_prepare_new before insert on public.schedules
  for each row execute function app.prepare_new_schedule();

-- 4. Update guards for user calls: R4, R2 and R8. R4 comes first: making an archived schedule
-- current would also match R2's condition.
create function app.guard_schedule_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    return new;
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

create trigger schedules_guard_update before update on public.schedules
  for each row execute function app.guard_schedule_update();

-- 5. R5 for every caller: one primary baseline per project. A new primary demotes the old one
-- (its updated_at moves, R11); a schedule that becomes a baseline while the project has no
-- primary becomes the primary one. Two promotions racing meet schedules_one_primary_uq.
create function app.apply_baseline() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- An insert this caller may not make changes nothing here; schedules_prepare_new refuses it
  -- (D35), so a refused insert never demotes another schedule first.
  if tg_op = 'INSERT' and (select auth.uid()) is not null
     and new.project_id not in (select app.my_project_ids('editor')) then
    return new;
  end if;
  if new.baseline = 'primary' and (tg_op = 'INSERT' or old.baseline <> 'primary') then
    update public.schedules s
    set baseline = 'baseline'
    where s.project_id = new.project_id and s.baseline = 'primary' and s.id <> new.id;
  elsif new.baseline = 'baseline' and (tg_op = 'INSERT' or old.baseline = 'none')
        and not exists (
          select 1 from public.schedules s
          where s.project_id = new.project_id and s.baseline = 'primary' and s.id <> new.id
        ) then
    new.baseline := 'primary';
  end if;
  return new;
end
$$;

create trigger schedules_apply_baseline before insert or update of baseline on public.schedules
  for each row execute function app.apply_baseline();

-- 6. R3, checked on the state the whole statement leaves: a project that still exists and still
-- has schedules keeps a current one. A project's own cascade deletes all its schedules, so it
-- passes.
create function app.check_current_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- R1: take the project lock schedules_prepare_new takes, so a delete and an insert into the
  -- same project run one after the other. The check below then sees a schedule an open insert
  -- added, and an insert after this delete sees the project without schedules. A project the
  -- statement's own cascade deleted is gone and isn't locked.
  perform 1 from public.projects p
  where p.id in (select d.project_id from deleted_rows d)
  order by p.id
  for update;
  if exists (
    select 1
    from (select distinct d.project_id from deleted_rows d) dp
    where exists (select 1 from public.projects p where p.id = dp.project_id)
      and exists (select 1 from public.schedules s where s.project_id = dp.project_id)
      and not exists (
        select 1 from public.schedules s where s.project_id = dp.project_id and s.is_current
      )
  ) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Make another schedule current before deleting this one.';
  end if;
  return null;
end
$$;

create trigger schedules_check_current_after_delete after delete on public.schedules
  referencing old table as deleted_rows
  for each statement execute function app.check_current_after_delete();

-- 7. R6: the project's status date follows its current schedule. status_date isn't in
-- projects_set_updated_at's column list, so the project's updated_at stays (R11).
create function app.sync_project_status_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_current then
    update public.projects p
    set status_date = new.status_date
    where p.id = new.project_id and p.status_date is distinct from new.status_date;
  end if;
  return null;
end
$$;

create trigger schedules_sync_project_status_date
  after insert or update of is_current, status_date on public.schedules
  for each row execute function app.sync_project_status_date();

create function app.guard_project_status_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.schedules s
    where s.project_id = new.id and s.is_current and s.status_date is distinct from new.status_date
  ) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'The status date follows the current schedule.';
  end if;
  return new;
end
$$;

create trigger projects_guard_status_date before update of status_date on public.projects
  for each row execute function app.guard_project_status_date();

-- 8. Existing rows (§4.6, D18): in every project with schedules and none current, the latest
-- status date (nulls last), then the latest created_at, then the highest id becomes current.
-- The sync trigger gives the project that status date; updated_at stays (R11).
create function app.backfill_current_schedules() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.schedules s
  set is_current = true
  from (
    select distinct on (c.project_id) c.id
    from public.schedules c
    where not exists (
      select 1 from public.schedules o where o.project_id = c.project_id and o.is_current
    )
    order by c.project_id, c.status_date desc nulls last, c.created_at desc, c.id desc
  ) pick
  where s.id = pick.id;
end
$$;

-- 9. RPCs (§4.7). Invoker RPCs check the role themselves, because RLS only filters an update or
-- a delete, and compare the affected row count with the id count.

-- R1, R4, R10: editors move the current flag. Definer, so it can write is_current, which no API
-- role may update.
create function public.set_current_schedule(p_schedule_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project_id uuid;
  v_archived_at timestamptz;
  v_is_current boolean;
begin
  select s.project_id, s.archived_at into v_project_id, v_archived_at
  from public.schedules s
  where s.id = p_schedule_id;
  if not found then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Some schedules are no longer available. Refresh and try again.';
  end if;
  if v_project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can change the current schedule.';
  end if;
  if v_archived_at is not null then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Restore this schedule before making it current.';
  end if;

  -- Two calls for the same project run one after the other.
  perform 1 from public.schedules s where s.project_id = v_project_id for update;

  -- Read again under the lock: a delete or an archive that committed while this call waited
  -- must not leave the project without a current schedule (R1).
  select s.is_current, s.archived_at into v_is_current, v_archived_at
  from public.schedules s
  where s.id = p_schedule_id;
  if not found then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Some schedules are no longer available. Refresh and try again.';
  end if;
  if v_archived_at is not null then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Restore this schedule before making it current.';
  end if;
  if v_is_current then
    return;
  end if;
  -- Two statements: the unique index on the current flag is checked per row.
  update public.schedules s set is_current = false
  where s.project_id = v_project_id and s.is_current;
  update public.schedules s set is_current = true where s.id = p_schedule_id;
end
$$;

-- R5–R8, R10, R11: one write of the details dialog. The column checks refuse a bad name,
-- baseline, notes or update number.
create function public.update_schedule_details(
  p_schedule_id uuid, p_name text, p_code text, p_status_date date, p_notes text,
  p_baseline text, p_update_number int
) returns void
language plpgsql set search_path = '' as $$
declare
  v_project_id uuid;
  v_updated int;
begin
  select s.project_id into v_project_id from public.schedules s where s.id = p_schedule_id;
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

-- R2, R9, R10, R11: archive or restore 1–500 schedules of one project, all or nothing. An
-- archived schedule keeps its first archive time.
create function public.set_schedules_archived(p_schedule_ids uuid[], p_archived boolean)
returns void
language plpgsql set search_path = '' as $$
declare
  v_ids uuid[];
  v_projects uuid[];
  v_found int;
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

-- R3, R9, R10: owners delete 1–500 schedules of one project, all or nothing, and get the stored
-- originals back for the adapter to remove (the statement trigger checks R3).
create function public.delete_schedules(p_schedule_ids uuid[]) returns setof text
language plpgsql set search_path = '' as $$
declare
  v_ids uuid[];
  v_projects uuid[];
  v_found int;
  v_deleted int;
  v_paths text[];
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
    delete from public.schedules s where s.id = any(v_ids) returning s.source_file_path
  )
  select count(*), array_agg(d.source_file_path) filter (where d.source_file_path is not null)
  into v_deleted, v_paths
  from deleted d;
  if v_deleted <> cardinality(v_ids) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only workspace owners can delete schedules.';
  end if;
  return query select unnest(coalesce(v_paths, '{}'::text[]));
end
$$;

-- 10. Views (§4.7): security invoker, so the caller's table policies apply.
create view public.project_summaries with (security_invoker = true) as
  select p.*,
         (select count(*) from public.schedules s
          where s.project_id = p.id and s.archived_at is null)::int as schedule_count,
         (select count(*) from public.schedules s where s.project_id = p.id)::int as total_schedule_count,
         c.id as current_schedule_id,
         c.name as current_schedule_name
  from public.projects p
  left join public.schedules c on c.project_id = p.id and c.is_current;

-- The schedule columns listed one by one: never the stored path (nor, later, the import mapping
-- and report).
create view public.schedule_items with (security_invoker = true) as
  select s.id, s.project_id, s.name, s.code, s.notes, s.status_date, s.source, s.source_file_name,
         s.is_current, s.baseline, s.update_number, s.archived_at, s.activity_count, s.created_at,
         s.updated_at
  from public.schedules s;

revoke all on public.project_summaries, public.schedule_items from anon, authenticated;
grant select on public.project_summaries, public.schedule_items to authenticated;
grant all on public.project_summaries, public.schedule_items to service_role;

-- 11. Grants (§4.8): column-level insert and update on schedules. is_current changes only through
-- set_current_schedule; id, created_at, updated_at, activity_count and the source columns are
-- never updated by users, and a schedule never moves to another project.
revoke insert on public.schedules from authenticated;
grant insert (project_id, name, status_date, source, source_file_name, source_file_path, code, notes,
  baseline, update_number) on public.schedules to authenticated;
grant update (name, status_date, code, notes, baseline, update_number, archived_at)
  on public.schedules to authenticated;

-- 12. Existing rows get their current schedule (the triggers above are in place).
select app.backfill_current_schedules();

-- Privileges: new functions are executable by PUBLIC until revoked (P2 Task 9 step 2).
revoke execute on function app.prepare_new_schedule(), app.guard_schedule_update(),
  app.apply_baseline(), app.check_current_after_delete(), app.sync_project_status_date(),
  app.guard_project_status_date(), app.backfill_current_schedules(),
  public.set_current_schedule(uuid),
  public.update_schedule_details(uuid, text, text, date, text, text, int),
  public.set_schedules_archived(uuid[], boolean), public.delete_schedules(uuid[])
  from public, anon, authenticated;
grant execute on function public.set_current_schedule(uuid),
  public.update_schedule_details(uuid, text, text, date, text, text, int),
  public.set_schedules_archived(uuid[], boolean), public.delete_schedules(uuid[])
  to authenticated;
