-- Phase 3 core: project attributes and project deletion (P3 core spec §4.6–§4.8, R10–R12).
-- P2 migrations are never edited; this one adds the project columns, narrows the updated_at
-- trigger to the user-updatable columns but status_date (R11), recreates project_summaries
-- (its p.* was expanded at creation) and adds delete_project.

-- project_summaries depends on projects; it is recreated below with the new columns.
drop view public.project_summaries;

-- 1. New project columns and the longer project type list.
alter table public.projects
  add column status text not null default 'active'
    check (status in ('active', 'on_hold', 'completed', 'cancelled')),
  add column stage text
    check (stage in ('pursuit', 'preconstruction', 'construction', 'closeout', 'completed')),
  add column sector text
    check (sector in ('public', 'private', 'public_private')),
  add column location_lat numeric(8, 6)
    check (location_lat between -90 and 90),
  add column location_lng numeric(9, 6)
    check (location_lng between -180 and 180),
  add constraint projects_location_pair_check
    check ((location_lat is null) = (location_lng is null));

alter table public.projects drop constraint projects_project_type_check;
alter table public.projects add constraint projects_project_type_check
  check (project_type in ('building', 'residential', 'infrastructure', 'industrial', 'energy',
                          'transportation', 'water', 'other'));

-- 2. R11: updated_at follows writes to the user-updatable columns, but not status_date, which
-- follows the current schedule (R6) and must not reorder Home's Recent projects.
drop trigger projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update of code, name, description, cover_image_path, project_type, start_date,
    planned_finish_date, client_name, client_contact_name, client_contact_email, location_address,
    location_city, location_country, status, stage, sector, location_lat, location_lng
  on public.projects
  for each row execute function app.set_updated_at();

-- 3. project_summaries with the new columns. total_schedule_count equals schedule_count until
-- p3_core_schedules adds archiving.
create view public.project_summaries with (security_invoker = true) as
  select p.*,
         (select count(*) from public.schedules s where s.project_id = p.id)::int as schedule_count,
         (select count(*) from public.schedules s where s.project_id = p.id)::int as total_schedule_count
  from public.projects p;

revoke all on public.project_summaries from anon, authenticated;
grant select on public.project_summaries to authenticated;
grant all on public.project_summaries to service_role;

-- 4. Grants (§4.8, D40): P2's table-level insert covers the new columns; update is column-level.
grant update (status, stage, sector, location_lat, location_lng) on public.projects to authenticated;

-- 5. R10, R12: owners delete a project. Invoker, so RLS applies: a hidden project is not found,
-- and the role is checked explicitly because RLS would only filter the delete. Returns the
-- stored objects (imported originals and the cover) for the adapter to remove afterwards.
create function public.delete_project(p_project_id uuid) returns table (bucket text, path text)
language plpgsql set search_path = '' as $$
declare
  v_deleted int;
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id) then
    raise exception using errcode = 'no_data_found', hint = 'app', message = 'Project not found';
  end if;
  if p_project_id not in (select app.my_project_ids('owner')) then
    raise exception using errcode = 'insufficient_privilege', message = 'Only workspace owners can delete projects.';
  end if;
  -- Lock the project row so a schedule inserted or a cover replaced meanwhile either finishes
  -- before the paths are collected or waits until the delete is done; no stored file is orphaned.
  perform 1 from public.projects p where p.id = p_project_id for update;

  return query
    select 'schedule-imports'::text, s.source_file_path
    from public.schedules s
    where s.project_id = p_project_id and s.source_file_path is not null
    union all
    select 'project-covers'::text, p.cover_image_path
    from public.projects p
    where p.id = p_project_id and p.cover_image_path is not null;

  -- Cascades to the project's schedules and their shares; tasks keep their rows without it.
  delete from public.projects p where p.id = p_project_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using errcode = 'insufficient_privilege', message = 'Only workspace owners can delete projects.';
  end if;
end
$$;

-- Privileges: new functions are executable by PUBLIC until revoked (P2 Task 9 step 2).
revoke execute on function public.delete_project(uuid) from public, anon, authenticated;
grant execute on function public.delete_project(uuid) to authenticated;
