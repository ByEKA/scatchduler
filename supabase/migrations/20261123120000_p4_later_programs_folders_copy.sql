-- Phase 4 later & Phase 3 deferred: workspace programs, project file folders, schedule duplication
-- and cross-workspace library view columns (spec §4.1–§4.4, R1–R7). Earlier migrations are never edited.

-- 1. Workspace programs (R1, R2).
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create unique index programs_workspace_name_uq
  on public.programs (workspace_id, lower(trim(name)));

alter table public.programs enable row level security;

create policy programs_select on public.programs for select to authenticated
  using (workspace_id in (select app.my_workspace_ids('viewer')));

revoke all on public.programs from public, anon, authenticated;
grant select on public.programs to authenticated;
grant all on public.programs to service_role;

-- 2. Project program_id column, workspace check trigger and recreated project_summaries view (R1, R2).
-- Note: program_id is intentionally omitted from projects_set_updated_at so deleting a program
-- (on delete set null) leaves projects.updated_at unchanged (R1).
drop view public.project_summaries;

alter table public.projects
  add column program_id uuid references public.programs (id) on delete set null;

create function app.check_project_program() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.program_id is not null and not exists (
    select 1 from public.programs pr
    where pr.id = new.program_id and pr.workspace_id = new.workspace_id
  ) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Choose a program in this workspace.';
  end if;
  return new;
end
$$;

create trigger projects_check_program
  before insert or update of program_id, workspace_id on public.projects
  for each row execute function app.check_project_program();

grant update (program_id) on public.projects to authenticated;

create view public.project_summaries with (security_invoker = true) as
  select p.*,
         pr.name as program_name,
         (select count(*) from public.schedules s
          where s.project_id = p.id and s.archived_at is null)::int as schedule_count,
         (select count(*) from public.schedules s where s.project_id = p.id)::int as total_schedule_count,
         c.id as current_schedule_id,
         c.name as current_schedule_name
  from public.projects p
  left join public.programs pr on pr.id = p.program_id
  left join public.schedules c on c.project_id = p.id and c.is_current;

revoke all on public.project_summaries from anon, authenticated;
grant select on public.project_summaries to authenticated;
grant all on public.project_summaries to service_role;

-- 3. Project folders (R3, R4).
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create unique index folders_sibling_name_uq
  on public.folders (
    project_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  );

alter table public.folders enable row level security;

create policy folders_select on public.folders for select to authenticated
  using (project_id in (select app.my_project_ids('viewer')));

revoke all on public.folders from public, anon, authenticated;
grant select on public.folders to authenticated;
grant all on public.folders to service_role;

create function app.check_folder_hierarchy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cur uuid := new.parent_id;
  v_proj uuid;
  v_depth int := 1;
begin
  while v_cur is not null loop
    if v_cur = new.id then
      raise exception using errcode = 'check_violation', hint = 'app',
        message = 'A folder cannot be placed inside itself.';
    end if;
    select f.project_id, f.parent_id into v_proj, v_cur
    from public.folders f
    where f.id = v_cur;
    if not found or v_proj is distinct from new.project_id then
      raise exception using errcode = 'check_violation', hint = 'app',
        message = 'Choose a folder in this project.';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 3 then
      raise exception using errcode = 'check_violation', hint = 'app',
        message = 'Folders can be nested up to 3 levels deep.';
    end if;
  end loop;
  return new;
end
$$;

create trigger folders_check_hierarchy
  before insert or update of parent_id, project_id on public.folders
  for each row execute function app.check_folder_hierarchy();

-- 4. Schedule folder_id and copied_from_id columns, trigger updates and schedule_items view (R5, R6).
-- Neither folder_id nor copied_from_id is in schedules_set_updated_at, so folder deletion and
-- moving schedules between folders leave schedules.updated_at unchanged (R4, R5).
alter table public.schedules
  add column folder_id uuid references public.folders (id) on delete set null,
  add column copied_from_id uuid references public.schedules (id) on delete set null;

grant insert (folder_id) on public.schedules to authenticated;

create or replace function app.fill_schedule_status_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status_date is null and new.copied_from_id is null then
    select p.status_date into new.status_date from public.projects p where p.id = new.project_id;
  end if;
  return new;
end
$$;

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
  if new.folder_id is not null and not exists (
    select 1 from public.folders f
    where f.id = new.folder_id and f.project_id = new.project_id
  ) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Choose a folder in this project.';
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

drop view public.schedule_items;
create view public.schedule_items with (security_invoker = true) as
  select s.id, s.project_id, s.folder_id, s.copied_from_id, s.name, s.code, s.notes,
         s.status_date, s.source, s.source_format, s.source_file_name, s.is_current,
         s.baseline, s.update_number, s.archived_at, s.activity_count,
         s.import_report is not null as has_import_report,
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

-- 5. Eight RPCs for programs, folders, moving schedules and duplicating schedules (R1–R6).

create function public.create_program(p_workspace_id uuid, p_name text)
returns table (id uuid, workspace_id uuid, name text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_trimmed text := trim(coalesce(p_name, ''));
begin
  if p_workspace_id is null or p_workspace_id not in (select app.my_workspace_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can manage programs.';
  end if;
  if v_trimmed = '' then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Enter a program name.';
  end if;
  if char_length(v_trimmed) > 80 then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Use 80 characters or fewer.';
  end if;

  return query
    insert into public.programs (workspace_id, name)
    values (p_workspace_id, v_trimmed)
    returning programs.id, programs.workspace_id, programs.name, programs.created_at;
end
$$;

create function public.rename_program(p_program_id uuid, p_name text)
returns table (id uuid, workspace_id uuid, name text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
  v_trimmed text := trim(coalesce(p_name, ''));
begin
  select pr.workspace_id into v_workspace_id
  from public.programs pr
  where pr.id = p_program_id
    and pr.workspace_id in (select app.my_workspace_ids('viewer'))
  for update;
  if not found then
    raise exception using errcode = 'no_data_found', hint = 'app',
      message = 'Program not found';
  end if;
  if v_workspace_id not in (select app.my_workspace_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can manage programs.';
  end if;
  if v_trimmed = '' then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Enter a program name.';
  end if;
  if char_length(v_trimmed) > 80 then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Use 80 characters or fewer.';
  end if;

  return query
    update public.programs pr
    set name = v_trimmed
    where pr.id = p_program_id
    returning pr.id, pr.workspace_id, pr.name, pr.created_at;
end
$$;

create function public.delete_program(p_program_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_workspace_id uuid;
begin
  select pr.workspace_id into v_workspace_id
  from public.programs pr
  where pr.id = p_program_id
    and pr.workspace_id in (select app.my_workspace_ids('viewer'))
  for update;
  if not found then
    raise exception using errcode = 'no_data_found', hint = 'app',
      message = 'Program not found';
  end if;
  if v_workspace_id not in (select app.my_workspace_ids('owner')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only workspace owners can delete programs.';
  end if;

  delete from public.programs pr where pr.id = p_program_id;
end
$$;

create function public.create_folder(p_project_id uuid, p_parent_id uuid, p_name text)
returns table (id uuid, project_id uuid, parent_id uuid, name text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_trimmed text := trim(coalesce(p_name, ''));
begin
  if p_project_id is null or p_project_id not in (select app.my_project_ids('viewer')) then
    raise exception using errcode = 'no_data_found', hint = 'app',
      message = 'Project not found';
  end if;
  if p_project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can manage folders.';
  end if;
  if v_trimmed = '' then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Enter a folder name.';
  end if;
  if char_length(v_trimmed) > 80 then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Use 80 characters or fewer.';
  end if;

  return query
    insert into public.folders (project_id, parent_id, name)
    values (p_project_id, p_parent_id, v_trimmed)
    returning folders.id, folders.project_id, folders.parent_id, folders.name, folders.created_at;
end
$$;

create function public.rename_folder(p_folder_id uuid, p_name text)
returns table (id uuid, project_id uuid, parent_id uuid, name text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_project_id uuid;
  v_trimmed text := trim(coalesce(p_name, ''));
begin
  select f.project_id into v_project_id
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
  if v_trimmed = '' then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Enter a folder name.';
  end if;
  if char_length(v_trimmed) > 80 then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Use 80 characters or fewer.';
  end if;

  return query
    update public.folders f
    set name = v_trimmed
    where f.id = p_folder_id
    returning f.id, f.project_id, f.parent_id, f.name, f.created_at;
end
$$;

create function public.delete_folder(p_folder_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project_id uuid;
  v_parent_id uuid;
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

  update public.folders f set parent_id = v_parent_id where f.parent_id = p_folder_id;
  update public.schedules s set folder_id = v_parent_id where s.folder_id = p_folder_id;
  delete from public.folders f where f.id = p_folder_id;
end
$$;

create function public.move_schedules_to_folder(p_schedule_ids uuid[], p_folder_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_projects uuid[];
  v_found int;
begin
  select coalesce(array_agg(distinct i), '{}') into v_ids from unnest(p_schedule_ids) as i;
  if cardinality(v_ids) = 0 then
    return;
  end if;
  if cardinality(v_ids) > 500 then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Select 500 schedules or fewer.';
  end if;
  select coalesce(array_agg(distinct s.project_id), '{}'), count(*)
  into v_projects, v_found
  from public.schedules s
  where s.id = any(v_ids)
    and s.project_id in (select app.my_project_ids('viewer'));
  if cardinality(v_projects) > 1 then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Select schedules from one project.';
  end if;
  if v_found <> cardinality(v_ids) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Some schedules are no longer available. Refresh and try again.';
  end if;
  if v_projects[1] not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can move schedules.';
  end if;
  if p_folder_id is not null and not exists (
    select 1 from public.folders f
    where f.id = p_folder_id and f.project_id = v_projects[1]
  ) then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Choose a folder in this project.';
  end if;

  update public.schedules s
  set folder_id = p_folder_id
  where s.id = any(v_ids);
end
$$;

create function public.copy_schedule(
  p_schedule_id uuid,
  p_new_schedule_id uuid,
  p_name text,
  p_code text,
  p_folder_id uuid,
  p_keep_source_folder boolean,
  p_source_file_path text,
  p_data_file_path text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_src public.schedules;
  v_new_id uuid := coalesce(p_new_schedule_id, gen_random_uuid());
  v_trimmed_name text := trim(coalesce(p_name, ''));
  v_trimmed_code text := trim(coalesce(p_code, ''));
  v_target_folder uuid;
begin
  select s.* into v_src
  from public.schedules s
  where s.id = p_schedule_id
    and s.project_id in (select app.my_project_ids('viewer'))
  for update;
  if not found then
    raise exception using errcode = 'no_data_found', hint = 'app',
      message = 'Schedule not found';
  end if;
  if v_src.project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can duplicate schedules.';
  end if;
  if v_trimmed_name = '' then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Enter a schedule name.';
  end if;
  if char_length(v_trimmed_name) > 120 then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Use 120 characters or fewer.';
  end if;
  if v_trimmed_code = '' then
    raise exception using errcode = 'check_violation', hint = 'app',
      message = 'Enter a schedule code.';
  end if;
  if (v_src.source_file_path is null) <> (p_source_file_path is null) then
    raise exception using errcode = 'check_violation',
      message = 'The stored file path doesn''t match the schedule.';
  end if;
  if (v_src.data_file_path is null) <> (p_data_file_path is null) then
    raise exception using errcode = 'check_violation',
      message = 'The stored schedule data path doesn''t match the schedule.';
  end if;

  v_target_folder := case
    when coalesce(p_keep_source_folder, true) then v_src.folder_id
    else p_folder_id
  end;

  insert into public.schedules (
    id, project_id, folder_id, copied_from_id, name, code, notes, status_date,
    source, source_format, source_file_name, source_file_path, source_file_size,
    source_file_sha256, source_project_code, parser_version, import_mapping, import_report,
    is_current, baseline, update_number, archived_at, activity_count,
    data_file_path, data_revision, calculation_mode
  ) values (
    v_new_id, v_src.project_id, v_target_folder, v_src.id, v_trimmed_name, v_trimmed_code,
    v_src.notes, v_src.status_date, v_src.source, v_src.source_format, v_src.source_file_name,
    p_source_file_path, v_src.source_file_size, v_src.source_file_sha256, v_src.source_project_code,
    v_src.parser_version, v_src.import_mapping, v_src.import_report,
    false, 'none', null, null, v_src.activity_count,
    p_data_file_path, case when p_data_file_path is null then 0 else 1 end, v_src.calculation_mode
  );

  return v_new_id;
end
$$;

-- 6. Privileges: revoke PUBLIC execute on all created or replaced functions, then grant explicitly.
revoke execute on function
  app.check_project_program(),
  app.check_folder_hierarchy(),
  app.fill_schedule_status_date(),
  app.prepare_new_schedule(),
  public.create_program(uuid, text),
  public.rename_program(uuid, text),
  public.delete_program(uuid),
  public.create_folder(uuid, uuid, text),
  public.rename_folder(uuid, text),
  public.delete_folder(uuid),
  public.move_schedules_to_folder(uuid[], uuid),
  public.copy_schedule(uuid, uuid, text, text, uuid, boolean, text, text)
from public, anon, authenticated;

grant execute on function
  public.create_program(uuid, text),
  public.rename_program(uuid, text),
  public.delete_program(uuid),
  public.create_folder(uuid, uuid, text),
  public.rename_folder(uuid, text),
  public.delete_folder(uuid),
  public.move_schedules_to_folder(uuid[], uuid),
  public.copy_schedule(uuid, uuid, text, text, uuid, boolean, text, text)
to authenticated;
