-- Core schema: Phase 1 spec §9 draft with the P2 spec §6.5 changes, RLS on every table and
-- the P2 spec §6.7 grants. Trigger functions live in the app schema (next migration); views
-- and policies come later.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 60),
  last_name text not null default '' check (char_length(last_name) <= 60),
  email text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'free', 'pro')),
  trial_ends_at timestamptz
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  kind text not null check (kind in ('personal', 'team')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create unique index workspace_invitations_pending_uq on public.workspace_invitations (workspace_id, email)
  where accepted_at is null and revoked_at is null;
create index workspace_invitations_pending_email_idx on public.workspace_invitations (email)
  where accepted_at is null and revoked_at is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,16}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  cover_image_path text,
  status_date date,
  project_type text check (project_type in ('building', 'infrastructure', 'industrial', 'residential', 'other')),
  start_date date,
  planned_finish_date date,
  client_name text,
  client_contact_name text,
  client_contact_email text,
  location_address text,
  location_city text,
  location_country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_finish_date is null or start_date is null or planned_finish_date >= start_date)
);
create unique index projects_workspace_code_uq on public.projects (workspace_id, lower(code));
create index projects_workspace_updated_idx on public.projects (workspace_id, updated_at desc);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status_date date,
  source text not null check (source in ('blank', 'import')),
  source_file_name text,
  source_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index schedules_project_idx on public.schedules (project_id);

create table public.schedule_shares (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  shared_by uuid not null references public.profiles (id),
  shared_with uuid not null references public.profiles (id),
  shared_at timestamptz not null default now(),
  unique (schedule_id, shared_with)
);
create index schedule_shares_with_idx on public.schedule_shares (shared_with, shared_at desc);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_assignee_pending_idx on public.tasks (assignee_id) where not done;

-- Row-level security on every table (policies come in a later migration).
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.projects enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_shares enable row level security;
alter table public.tasks enable row level security;

-- Grants (P2 spec §6.7): start from nothing, then grant explicitly.
-- 1. Remove Supabase's API-role grants on existing objects, and PostgreSQL's EXECUTE for PUBLIC.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke execute on all functions in schema public from public;

-- 2. Later objects in public start clean for the API roles. These per-schema defaults cannot
-- remove PostgreSQL's global EXECUTE for PUBLIC on new functions, so every migration that
-- creates a function revokes EXECUTE on it explicitly. No global (schema-less) revoke: it
-- would also strip EXECUTE from extensions created later (pgTAP stops working).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 3. The service role keeps full table privileges.
grant all on all tables in schema public to service_role;

-- 4. Table-level privileges for signed-in users.
grant select on public.profiles, public.subscriptions, public.workspaces, public.workspace_members,
  public.workspace_invitations, public.projects, public.schedules, public.schedule_shares, public.tasks
  to authenticated;
grant insert on public.projects, public.schedules, public.schedule_shares to authenticated;
grant delete on public.projects, public.schedules, public.schedule_shares to authenticated;

-- 5. Column-level update privileges (table-level UPDATE stays revoked).
grant update (first_name, last_name, avatar_url) on public.profiles to authenticated;
grant update (name) on public.workspaces to authenticated;
grant update (code, name, description, cover_image_path, status_date, project_type, start_date,
  planned_finish_date, client_name, client_contact_name, client_contact_email, location_address,
  location_city, location_country) on public.projects to authenticated;
grant update (name, status_date) on public.schedules to authenticated;
grant update (done) on public.tasks to authenticated;
