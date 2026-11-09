begin;
\ir _helpers.psql
select plan(35);

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive"}');
  v_ed uuid := tests.create_user('ed@test.dev', true, '{"first_name":"Ed"}');
  v_vi uuid := tests.create_user('vi@test.dev', true, '{"first_name":"Vi"}');
  v_out uuid := tests.create_user('out@test.dev', true, '{"first_name":"Out"}');
  v_sam uuid := tests.create_user('sam@test.dev', true, '{"first_name":"Sam"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_other uuid := tests.team_workspace('Other', v_sam);
  v_shared uuid;
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  perform tests.add_project(v_crew, 'P1');
  perform tests.add_project(v_crew, 'P2');
  update public.projects set updated_at = '2026-01-01T00:00:00Z' where code = 'P2';  -- so the editor's touch below is visible
  perform tests.add_project(v_other, 'Q2');
  insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'S1', 'blank');
  insert into public.schedules (project_id, name, source) values (tests.add_project(v_other, 'Q1'), 'Shared one', 'blank') returning id into v_shared;
  insert into public.schedule_shares (schedule_id, shared_by, shared_with) values (v_shared, v_sam, v_out);
  insert into public.tasks (assignee_id, title) values (v_ed, 'Ed''s task');
  insert into public.workspace_invitations (workspace_id, email, role, invited_by) values (v_crew, 'new@test.dev', 'editor', v_olive);
end $$;

-- an outsider
select tests.authenticate_as(tests.user_id('out@test.dev'));
select is_empty($$ select 1 from public.workspaces where name = 'Crew' $$, 'an outsider cannot see the workspace');
select is_empty($$ select 1 from public.workspace_members where workspace_id = tests.workspace_id('Crew') $$, '… its members');
select is_empty($$ select 1 from public.projects where code = 'P1' $$, '… its projects');
select is_empty($$ select 1 from public.schedules where name = 'S1' $$, '… or its schedules');
select results_eq($$ select code from public.projects order by code $$, $$ values ('Q1'::text) $$, 'a share reveals only the shared schedule''s project');
select results_eq($$ select schedule_name, project_name, shared_by_first_name from public.shared_with_me $$,
  $$ values ('Shared one'::text, 'Project Q1'::text, 'Sam'::text) $$, 'shared_with_me names the schedule, project and sharer');
select results_eq($$ select first_name from public.profiles order by first_name $$, $$ values ('Out'::text), ('Sam'::text) $$, 'profiles: self and the sharer only');
select results_eq($$ select count(*)::int from public.subscriptions $$, $$ values (1) $$, 'subscriptions: their own only');
select is_empty($$ select 1 from public.workspace_summaries where name = 'Crew' $$, 'the summary views filter too: no workspace summary');
select is_empty($$ select 1 from public.project_summaries where code = 'P1' $$, '… and no project summary');

-- a viewer
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select results_eq($$ select name, my_role, project_count from public.workspace_summaries where name = 'Crew' $$,
  $$ values ('Crew'::text, 'viewer'::text, 2) $$, 'a viewer sees the workspace with their role');
select isnt_empty($$ select 1 from public.schedules where name = 'S1' $$, 'a viewer reads schedules');
select throws_ok($$ insert into public.projects (workspace_id, code, name) values (tests.workspace_id('Crew'), 'V1', 'Nope') $$, '42501', null, 'a viewer cannot add projects');
select throws_ok($$ insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'Nope', 'blank') $$, '42501', null, 'a viewer cannot add schedules');
with u as (update public.projects set name = 'Renamed' where code = 'P1' returning 1) select is(count(*)::int, 0, 'a viewer cannot rename projects') from u;
select is_empty($$ select 1 from public.workspace_invitations $$, 'a viewer cannot see invitations');
select is_empty($$ select 1 from public.tasks $$, 'a viewer sees only their own tasks');

-- an editor
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ insert into public.projects (workspace_id, code, name) values (tests.workspace_id('Crew'), 'E1', 'Editor project') $$, 'an editor adds projects');
select lives_ok($$ insert into public.schedules (project_id, name, code, source) values (tests.project_id('P2'), 'By editor', 'BE-1', 'blank') $$, 'an editor adds schedules');
select is((select updated_at from public.projects where code = 'P2'), now(), 'the editor''s schedule touches the project (touch_project must be a definer)');
with u as (update public.projects set name = 'Pier' where code = 'P1' returning 1) select is(count(*)::int, 1, 'an editor renames projects') from u;
with d as (delete from public.projects where code = 'E1' returning 1) select is(count(*)::int, 0, 'only owners delete projects') from d;
with u as (update public.workspaces set name = 'Ed crew' where name = 'Crew' returning 1) select is(count(*)::int, 0, 'only owners rename the workspace') from u;
select throws_ok($$ insert into public.workspace_members (workspace_id, user_id, role) values (tests.workspace_id('Crew'), tests.user_id('out@test.dev'), 'owner') $$, '42501', null, 'memberships are never inserted directly');
select throws_ok($$ update public.workspace_members set role = 'owner' where user_id = tests.user_id('ed@test.dev') $$, '42501', null, 'an editor cannot make themselves owner');
with u as (update public.tasks set done = true returning 1) select is(count(*)::int, 1, 'an editor completes their own task') from u;
select throws_ok($$ update public.tasks set title = 'Changed' $$, '42501', null, 'only done is editable on tasks');
with u as (update public.profiles set first_name = 'Edward' where id = tests.user_id('ed@test.dev') returning 1) select is(count(*)::int, 1, 'people rename themselves') from u;
select throws_ok($$ update public.profiles set email = 'x@test.dev' where id = tests.user_id('ed@test.dev') $$, '42501', null, 'the profile email is read-only');
with u as (update public.profiles set first_name = 'Hacked' where id = tests.user_id('olive@test.dev') returning 1) select is(count(*)::int, 0, 'nobody renames someone else') from u;

-- an owner
select tests.authenticate_as(tests.user_id('olive@test.dev'));
select results_eq($$ select email from public.workspace_invitations $$, $$ values ('new@test.dev'::text) $$, 'owners see invitations');
with d as (delete from public.projects where code = 'E1' returning 1) select is(count(*)::int, 1, 'owners delete projects') from d;
with u as (update public.workspaces set name = 'Crew Two' where name = 'Crew' returning 1) select is(count(*)::int, 1, 'owners rename the workspace') from u;

-- anonymous
select tests.authenticate_as_anon();
select throws_ok($$ select 1 from public.projects $$, '42501', null, 'anon cannot read app tables');
select throws_ok($$ select 1 from public.workspace_summaries $$, '42501', null, 'anon cannot read app views');

select tests.clear_authentication();
select * from finish();
rollback;
