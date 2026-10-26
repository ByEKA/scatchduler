begin;
\ir _helpers.psql
select plan(19);

select has_table('public', t, format('table public.%s exists', t))
  from unnest(array['profiles', 'subscriptions', 'workspaces', 'workspace_members', 'workspace_invitations',
                    'projects', 'schedules', 'schedule_shares', 'tasks']) as t;

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0, 'RLS is enabled on every public table');

do $$
declare v_owner uuid := tests.create_profile('owner@test.dev'); v_ws uuid;
begin
  insert into public.workspaces (name, kind, created_by) values ('Crew', 'team', v_owner) returning id into v_ws;
  insert into public.projects (workspace_id, code, name, status_date, updated_at) values (v_ws, 'P1', 'Pier', '2026-10-12', '2026-01-01T00:00:00Z');
end $$;

select throws_ok($$ insert into public.workspace_members (workspace_id, user_id, role) values (tests.workspace_id('Crew'), tests.user_id('owner@test.dev'), 'member') $$,
  '23514', null, 'roles are owner, editor or viewer');
select throws_ok($$ insert into public.projects (workspace_id, code, name) values (tests.workspace_id('Crew'), 'p1', 'Copy') $$,
  '23505', null, 'project codes are unique per workspace, ignoring case');
select throws_ok($$ insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'Ann@test.dev', 'editor') $$,
  '23514', null, 'invitation emails are stored lowercased');
insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'ann@test.dev', 'editor');
select throws_ok($$ insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'ann@test.dev', 'viewer') $$,
  '23505', null, 'one pending invitation per workspace and email');
update public.workspace_invitations set revoked_at = now() where email = 'ann@test.dev';
select lives_ok($$ insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'ann@test.dev', 'viewer') $$,
  'a revoked invitation does not block a new one');

update public.projects set name = 'Pier 2' where code = 'P1';
select is((select updated_at from public.projects where code = 'P1'), now(), 'an update without updated_at sets it to now');
update public.projects set updated_at = '2026-02-02T00:00:00Z' where code = 'P1';
select is((select updated_at from public.projects where code = 'P1'), '2026-02-02T00:00:00Z'::timestamptz, 'an explicit updated_at is kept');
insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'Baseline', 'blank');
select is((select status_date from public.schedules where name = 'Baseline' and project_id = tests.project_id('P1')), '2026-10-12'::date, 'a new schedule copies the project status date');
select is((select updated_at from public.projects where code = 'P1'), now(), 'a new schedule touches its project');

select * from finish();
rollback;
