-- Phase 3 core: import columns and the storage rule (P3 core spec §4.6–§4.9). P2 migrations are
-- never edited; this one adds the import columns of schedules, backfills the format of P2-era
-- imports, makes the insert trigger refuse a stored path other than the new layout, recreates
-- schedule_items with the format and the has_import_* flags, and replaces P2's delete policy on
-- schedule-imports so no editor can remove an original a schedule names.

-- 1. Columns and checks (§4.6). The SHA-256 is of the original, uncompressed bytes; P2-era
-- imports keep mapping, report, parser version, size and hash null (§5.8).
alter table public.schedules
  add column source_format text check (source_format in ('xer', 'mspdi', 'xlsx', 'csv')),
  add column source_file_size bigint check (source_file_size between 1 and 20971520),
  add column source_file_sha256 text check (source_file_sha256 ~ '^[0-9a-f]{64}$'),
  add column source_project_code text check (char_length(source_project_code) <= 100),
  add column parser_version text check (char_length(parser_version) <= 20),
  add column import_mapping jsonb
    check (jsonb_typeof(import_mapping) = 'object' and octet_length(import_mapping::text) <= 16384),
  add column import_report jsonb
    check (jsonb_typeof(import_report) = 'object' and octet_length(import_report::text) <= 262144);

-- Each stored object belongs to one schedule.
create unique index schedules_source_file_path_uq on public.schedules (source_file_path)
  where source_file_path is not null;

-- 2. Existing rows (§4.6, D18): P2 accepted .xer, .xml and .csv only. Any other extension stops
-- the migration and names the rows, so the owner decides before it goes on. The update names no
-- column of schedules_set_updated_at, so updated_at stays (R11).
create function app.backfill_import_formats() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rows text;
begin
  update public.schedules s
  set source_format = case lower(substring(s.source_file_name from '\.([^.]+)$'))
      when 'xer' then 'xer'
      when 'xml' then 'mspdi'
      when 'csv' then 'csv'
    end
  where s.source = 'import' and s.source_format is null;

  select string_agg(s.id || ' ' || coalesce(s.source_file_name, ''), ', ' order by s.created_at, s.id)
  into v_rows
  from public.schedules s
  where s.source = 'import' and s.source_format is null;
  if v_rows is not null then
    raise exception using errcode = 'check_violation',
      message = 'Schedules with an import format the migration can''t tell: ' || v_rows;
  end if;
end
$$;

select app.backfill_import_formats();

alter table public.schedules
  add constraint schedules_source_format_presence_check
  check ((source = 'import') = (source_format is not null));

-- 3. Insert: as p3_core_schedules (D35 role check, project lock, R1, R8), plus the path rule for
-- user calls (§4.7, §4.9): {workspace_id}/{project_id}/{uuid}.{xer|xml|csv}.gz, or .xlsx as it
-- is, under the row's own project, with the suffix matching source_format. A path that breaks
-- the rule is the adapter's mistake, so the error carries no app hint.
create or replace function app.prepare_new_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_suffix text;
begin
  if v_user_id is not null and new.project_id not in (select app.my_project_ids('editor')) then
    raise exception using errcode = 'insufficient_privilege',
      message = 'Only editors and owners can add schedules to this project.';
  end if;
  -- Serializes the project's inserts, so two first schedules can't both become current, and
  -- orders them with deletes, whose R3 check takes the same lock (check_current_after_delete).
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
  return new;
end
$$;

-- 4. schedule_items (§4.7) with the format and whether a report and a mapping are stored; never
-- the stored path, the mapping or the report themselves.
drop view public.schedule_items;
create view public.schedule_items with (security_invoker = true) as
  select s.id, s.project_id, s.name, s.code, s.notes, s.status_date, s.source, s.source_format,
         s.source_file_name, s.is_current, s.baseline, s.update_number, s.archived_at,
         s.activity_count, s.import_report is not null as has_import_report,
         s.import_mapping is not null as has_import_mapping, s.created_at, s.updated_at
  from public.schedules s;

revoke all on public.schedule_items from anon, authenticated;
grant select on public.schedule_items to authenticated;
grant all on public.schedule_items to service_role;

-- 5. Grants (§4.8): the import columns are set on insert and never updated by users.
grant insert (source_format, source_file_size, source_file_sha256, source_project_code,
  parser_version, import_mapping, import_report, activity_count) on public.schedules to authenticated;

-- 6. Storage (§4.9): owners of the workspace in the first path segment delete any object; an
-- editor deletes only an object they uploaded (V7: owner_id holds the uploader's id as text) that
-- no schedule names, which is P2's cleanup after a failed insert. The object's name is qualified:
-- public.schedules has its own name column.
drop policy schedule_imports_delete on storage.objects;
create policy schedule_imports_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'schedule-imports'
    and (
      (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('owner') as id)
      or (
        (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('editor') as id)
        and owner_id = (select auth.uid())::text
        and not exists (select 1 from public.schedules s where s.source_file_path = objects.name)
      )
    )
  );

-- Privileges: new and replaced functions are executable by no API role (P2 Task 9 step 2).
revoke execute on function app.backfill_import_formats(), app.prepare_new_schedule()
  from public, anon, authenticated;
