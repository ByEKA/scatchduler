begin;
\ir _helpers.psql
select plan(36);

select is_empty($$ select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' $$,
  'anon has no privileges on public tables');
select table_privs_are('public', 'profiles', 'authenticated', array['SELECT'], 'profiles: select only at table level');
select column_privs_are('public', 'profiles', 'first_name', 'authenticated', array['SELECT', 'UPDATE'], 'profiles.first_name is editable');
select column_privs_are('public', 'profiles', 'email', 'authenticated', array['SELECT'], 'profiles.email is read-only');
select column_privs_are('public', 'workspaces', 'name', 'authenticated', array['SELECT', 'UPDATE'], 'workspaces.name is editable');
select column_privs_are('public', 'workspaces', 'kind', 'authenticated', array['SELECT'], 'workspaces.kind is read-only');
select table_privs_are('public', 'workspace_members', 'authenticated', array['SELECT'], 'memberships change only through functions');
select table_privs_are('public', 'workspace_invitations', 'authenticated', array['SELECT'], 'invitations change only through the Edge Function');
select table_privs_are('public', 'projects', 'authenticated', array['DELETE', 'INSERT', 'SELECT'], 'projects: select, insert, delete; columns for update');
select column_privs_are('public', 'projects', 'updated_at', 'authenticated', array['INSERT', 'SELECT'], 'projects.updated_at is never updated by users');
select column_privs_are('public', 'tasks', 'done', 'authenticated', array['SELECT', 'UPDATE'], 'tasks.done is editable');
select column_privs_are('public', 'tasks', 'title', 'authenticated', array['SELECT'], 'tasks.title is read-only');
select function_privs_are('app', 'my_workspace_ids', array['text'], 'authenticated', array['EXECUTE'], 'policies can call my_workspace_ids');
select function_privs_are('app', 'my_workspace_ids', array['text'], 'anon', array[]::text[], 'anon cannot');
select function_privs_are('app', 'has_role', array['uuid', 'text'], 'authenticated', array[]::text[], 'has_role is internal');

select table_privs_are('public', 'workspace_summaries', 'authenticated', array['SELECT'], 'views are readable by signed-in users');
select table_privs_are('public', 'workspace_summaries', 'anon', array[]::text[], 'anon cannot read the views');
select function_privs_are('public', 'create_team_workspace', array['text'], 'authenticated', array['EXECUTE'], 'signed-in users call the RPCs');
select function_privs_are('public', 'create_team_workspace', array['text'], 'anon', array[]::text[], 'anon cannot');
select column_privs_are('public', 'projects', c, 'authenticated', array['INSERT', 'SELECT', 'UPDATE'], format('projects.%s is set and edited', c))
  from unnest(array['status', 'stage', 'sector', 'location_lat', 'location_lng']) as c;
select table_privs_are('public', 'schedules', 'authenticated', array['DELETE', 'SELECT'], 'schedules: select and delete at table level; columns for insert and update');
select column_privs_are('public', 'schedules', 'code', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'], 'schedules.code is set and edited');
select column_privs_are('public', 'schedules', 'is_current', 'authenticated', array['SELECT'], 'is_current changes only through set_current_schedule');
select column_privs_are('public', 'schedules', 'project_id', 'authenticated', array['INSERT', 'SELECT'], 'a schedule never moves to another project');
select column_privs_are('public', 'schedules', 'updated_at', 'authenticated', array['SELECT'], 'schedules.updated_at is never written by users');
select column_privs_are('public', 'schedules', c, 'authenticated', array['INSERT', 'SELECT'], format('schedules.%s is set on insert only', c))
  from unnest(array['source_format', 'import_report', 'activity_count']) as c;
select table_privs_are('public', 'schedule_items', 'authenticated', array['SELECT'], 'schedule_items is readable by signed-in users');
select table_privs_are('public', 'schedule_items', 'anon', array[]::text[], 'anon cannot read schedule_items');
select is_empty($$
  select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon can execute no app function');
select set_eq($$
  select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and has_function_privilege('authenticated', p.oid, 'execute') $$,
  $$ values ('app.my_project_ids(text)'), ('app.my_workspace_ids(text)'), ('public.create_team_workspace(text)'),
            ('public.delete_project(uuid)'), ('public.delete_schedules(uuid[])'),
            ('public.is_project_code_available(uuid, text)'), ('public.remove_member(uuid, uuid)'),
            ('public.set_current_schedule(uuid)'), ('public.set_schedules_archived(uuid[], boolean)'),
            ('public.update_member_role(uuid, uuid, text)'),
            ('public.update_schedule_details(uuid, text, text, date, text, text, integer)') $$,
  'signed-in users can execute exactly the nine RPCs and the two RLS helpers');

select * from finish();
rollback;
