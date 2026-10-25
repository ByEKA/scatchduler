-- The app schema: role helpers for policies and functions, and the trigger functions
-- (P2 spec §6.5, §6.6). The schema is not exposed through the API.

create schema app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- owner 3 · editor 2 · viewer 1 · anything else 0
create function app.role_rank(p_role text) returns int
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 3 when 'editor' then 2 when 'viewer' then 1 else 0 end
$$;

-- Workspaces where the caller's role is at least p_min_role.
create function app.my_workspace_ids(p_min_role text default 'viewer') returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())
    and app.role_rank(m.role) >= app.role_rank(p_min_role)
$$;

-- Projects in those workspaces.
create function app.my_project_ids(p_min_role text default 'viewer') returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.id
  from public.projects p
  where p.workspace_id in (select app.my_workspace_ids(p_min_role))
$$;

-- Role check inside functions.
create function app.has_role(p_workspace_id uuid, p_min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and app.role_rank(m.role) >= app.role_rank(p_min_role)
  )
$$;

-- updated_at follows every update unless the statement itself changed updated_at
-- (lets the seed write historical times).
create function app.set_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end
$$;

-- A new schedule without a status date copies its project's.
create function app.fill_schedule_status_date() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status_date is null then
    select p.status_date into new.status_date from public.projects p where p.id = new.project_id;
  end if;
  return new;
end
$$;

-- A new schedule bumps its project's updated_at (drives "Recent projects").
create function app.touch_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set updated_at = now() where id = new.project_id;
  return new;
end
$$;

create trigger projects_set_updated_at before update on public.projects
  for each row execute function app.set_updated_at();
create trigger schedules_set_updated_at before update on public.schedules
  for each row execute function app.set_updated_at();
create trigger schedules_fill_status_date before insert on public.schedules
  for each row execute function app.fill_schedule_status_date();
create trigger schedules_touch_project after insert on public.schedules
  for each row execute function app.touch_project();

-- Privileges: new functions are executable by PUBLIC until revoked. This covers only the
-- functions that exist now; later migrations revoke their own.
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.my_workspace_ids(text), app.my_project_ids(text) to authenticated;
