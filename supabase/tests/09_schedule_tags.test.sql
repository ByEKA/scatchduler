begin;
\ir _helpers.psql
select plan(69);

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive"}');
  v_ed uuid := tests.create_user('ed@test.dev', true, '{"first_name":"Ed"}');
  v_vi uuid := tests.create_user('vi@test.dev', true, '{"first_name":"Vi"}');
  v_out uuid := tests.create_user('out@test.dev', true, '{"first_name":"Out"}');
  v_sam uuid := tests.create_user('sam@test.dev', true, '{"first_name":"Sam"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_a uuid;
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  perform tests.team_workspace('Other', v_sam);
  perform tests.add_project(v_crew, 'P1');
  perform tests.add_project(v_crew, 'P2');
  perform tests.add_project(v_crew, 'P3');
  perform tests.add_project(v_crew, 'P4');
  insert into public.schedules (project_id, name, code, source, status_date)
    values (tests.project_id('P1'), 'A', 'A-1', 'blank', '2026-10-01') returning id into v_a;
  insert into public.schedules (project_id, name, code, source, status_date)
    values (tests.project_id('P1'), 'B', 'B-1', 'blank', '2026-09-01');
  insert into public.schedules (project_id, name, code, source, status_date, source_file_path)
    values (tests.project_id('P1'), 'C', 'C-1', 'blank', '2026-08-01', 'crew/p1/c.xer');
  insert into public.schedules (project_id, name, code, source) values (tests.project_id('P2'), 'D', 'D-1', 'blank');
  insert into public.schedules (project_id, name, code, source)
    values (tests.project_id('P3'), 'X3', 'X', 'blank'), (tests.project_id('P3'), 'Y3', 'Y', 'blank'),
           (tests.project_id('P4'), 'X4', 'X', 'blank'), (tests.project_id('P4'), 'Y4', 'Y', 'blank');
  insert into public.schedule_shares (schedule_id, shared_by, shared_with) values (v_a, v_olive, v_out);
end $$;

-- R1
select results_eq($$ select name, is_current from public.schedules where project_id = tests.project_id('P1') order by name $$,
  $$ values ('A'::text, true), ('B', false), ('C', false) $$, 'R1: the first schedule of a project is current');
select results_eq($$ select name from public.schedules where is_current and project_id in (tests.project_id('P3'), tests.project_id('P4')) order by name $$,
  $$ values ('X3'::text), ('X4') $$, 'R1: also within one multi-row insert');

-- D35: the insert trigger's role check comes before RLS and R8
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok($$ insert into public.schedules (project_id, name, code, source) values (tests.project_id('P1'), 'Nope', 'N-1', 'blank') $$, '42501', null, 'D35: the insert trigger refuses a viewer');
select throws_ok($$ insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'Nope', 'blank') $$, '42501', null, 'D35: before R8 could answer');
select tests.authenticate_as(tests.user_id('out@test.dev'));
select throws_ok($$ insert into public.schedules (project_id, name, code, source) values (tests.project_id('P1'), 'Nope', 'N-1', 'blank') $$, '42501', null, 'D35: and a share recipient');

-- R8 on insert and update
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok($$ insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'E', 'blank') $$, '23514', 'Enter a schedule code.', 'R8: a user insert needs a code');
select throws_ok($$ insert into public.schedules (project_id, name, code, source) values (tests.project_id('P1'), 'E', '  ', 'blank') $$, '23514', 'Enter a schedule code.', 'R8: a blank code is no code');
select throws_ok($$ insert into public.schedules (project_id, name, code, source) values (tests.project_id('P1'), 'E', 'a b', 'blank') $$, '23514', null, 'R8: codes match the pattern');
select throws_ok($$ insert into public.schedules (project_id, name, code, source) values (tests.project_id('P1'), 'E', 'a-1', 'blank') $$, '23505', null, 'R8: codes are unique per project, ignoring case');
select lives_ok($$ insert into public.schedules (project_id, name, code, source) values (tests.project_id('P2'), 'A in P2', 'A-1', 'blank') $$, 'R8: the same code in another project');
select throws_ok($$ update public.schedules set code = null where name = 'B' $$, '23514', 'Enter a schedule code.', 'R8: a code cannot be cleared');
select tests.clear_authentication();
select lives_ok($$ insert into public.schedules (project_id, name, source) values (tests.project_id('P2'), 'Seeded', 'blank') $$, 'calls without auth.uid() skip the user guards (seed loader)');
select lives_ok($$ update public.schedules set code = null where name = 'D' $$, 'the update guard skips them too');

-- set_current_schedule: R1, R4, R6, R10, R11
update public.schedules set updated_at = '2026-01-01T00:00:00Z' where project_id = tests.project_id('P1');
update public.projects set updated_at = '2026-01-01T00:00:00Z' where code = 'P1';
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ select public.set_current_schedule(tests.schedule_id('B')) $$, 'editors make a schedule current');
select results_eq($$ select s.name, p.status_date from public.schedules s join public.projects p on p.id = s.project_id where s.is_current and p.code = 'P1' $$,
  $$ values ('B'::text, '2026-09-01'::date) $$, 'R1, R6: one current schedule, and the project takes its status date');
select results_eq($$ select (select updated_at from public.schedules where name = 'B'), (select updated_at from public.projects where code = 'P1') $$,
  $$ values ('2026-01-01T00:00:00Z'::timestamptz, '2026-01-01T00:00:00Z'::timestamptz) $$, 'R11: making current and the sync leave both updated_at values alone');
select throws_ok($$ update public.schedules set is_current = true where name = 'A' $$, '42501', null, 'is_current is written only by set_current_schedule');
select tests.clear_authentication();
update public.schedules set archived_at = '2026-02-01T00:00:00Z' where name = 'C';
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok($$ select public.set_current_schedule(tests.schedule_id('C')) $$, '23514', 'Restore this schedule before making it current.', 'R4');
select throws_ok($$ select public.set_current_schedule(gen_random_uuid()) $$, '23514', 'Some schedules are no longer available. Refresh and try again.', 'an unknown schedule is no longer available');
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok($$ select public.set_current_schedule(tests.schedule_id('A')) $$, '42501', null, 'R10: viewers cannot make a schedule current');
select tests.authenticate_as(tests.user_id('sam@test.dev'));
select throws_ok($$ select public.set_current_schedule(tests.schedule_id('A')) $$, '42501', null, 'R10: nor can outsiders');

-- R2, R6
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok($$ update public.schedules set archived_at = now() where name = 'B' $$, '23514', 'Make another schedule current before archiving this one.', 'R2: a direct PATCH');
select throws_ok($$ select public.set_schedules_archived(array[tests.schedule_id('B')], true) $$, '23514', 'Make another schedule current before archiving this one.', 'R2: through the RPC');
select throws_ok($$ update public.projects set status_date = '2026-01-01' where code = 'P1' $$, '23514', 'The status date follows the current schedule.', 'R6: the project status date follows the current schedule');

-- views
select results_eq($$ select schedule_count, total_schedule_count, current_schedule_name from public.project_summaries where code = 'P1' $$,
  $$ values (2, 3, 'B'::text) $$, 'project_summaries: schedules that aren''t archived, all of them, and the current one');
select hasnt_column('public', 'schedule_items', 'source_file_path', 'schedule_items leaves the stored path out');
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select results_eq($$ select count(*)::int from public.schedule_items where project_id = tests.project_id('P1') $$, $$ values (3) $$, 'members read schedule_items');
select tests.authenticate_as(tests.user_id('sam@test.dev'));
select is_empty($$ select 1 from public.schedule_items where project_id = tests.project_id('P1') $$, 'outsiders read nothing');

-- update_schedule_details: R5–R8, R11
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ select public.update_schedule_details(tests.schedule_id('B'), ' B ', ' b-2 ', '2026-09-15', '  ', 'none', null) $$, 'editors save details');
select results_eq($$ select name, code, notes, updated_at = now() from public.schedules where id = tests.schedule_id('B') $$,
  $$ values ('B'::text, 'b-2'::text, null::text, true) $$, 'trims the text, stores empty notes as null and moves updated_at (R11)');
select results_eq($$ select status_date, updated_at from public.projects where code = 'P1' $$,
  $$ values ('2026-09-15'::date, '2026-01-01T00:00:00Z'::timestamptz) $$, 'R6, R11: the project follows the current schedule''s date and keeps its updated_at');
select lives_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'A-1', '2026-10-01', null, 'baseline', null) $$, 'a schedule becomes a baseline');
select results_eq($$ select baseline from public.schedules where name = 'A' $$, $$ values ('primary'::text) $$, 'R5: the first baseline of a project becomes the primary one');
select tests.clear_authentication();
update public.schedules set updated_at = '2026-01-01T00:00:00Z' where name = 'A';
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ select public.update_schedule_details(tests.schedule_id('B'), 'B', 'b-2', '2026-09-15', null, 'primary', null) $$, 'another schedule becomes the primary baseline');
select results_eq($$ select name, baseline, updated_at = now() from public.schedules where project_id = tests.project_id('P1') and baseline <> 'none' order by name $$,
  $$ values ('A'::text, 'baseline'::text, true), ('B', 'primary', true) $$, 'R5, R11: the old primary is demoted and its updated_at moves');
select lives_ok($$ update public.schedules set baseline = 'primary' where name = 'A' $$, 'a direct PATCH of the baseline');
select results_eq($$ select name, baseline from public.schedules where project_id = tests.project_id('P1') and baseline <> 'none' order by name $$,
  $$ values ('A'::text, 'primary'::text), ('B', 'baseline') $$, 'R5 holds for direct PATCHes too');
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'A-1', '2026-10-01', null, 'gold', null) $$, '23514', null, 'baselines come from the list');
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'A-1', '2026-10-01', null, 'primary', 1000) $$, '23514', null, 'R7: update numbers are 1 to 999');
select lives_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'A-1', '2026-10-01', null, 'primary', 1) $$, 'an update number is stored');
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('B'), 'B', 'b-2', '2026-09-15', null, 'baseline', 1) $$, '23505', null, 'R7: update numbers are unique per project');
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', '  ', '2026-10-01', null, 'primary', 1) $$, '23514', 'Enter a schedule code.', 'R8: details need a code');
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'B-2', '2026-10-01', null, 'primary', 1) $$, '23505', null, 'R8: a taken code, ignoring case');
select tests.authenticate_as(tests.user_id('sam@test.dev'));
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'A-1', null, null, 'none', null) $$, '23514', 'Some schedules are no longer available. Refresh and try again.', 'a schedule the caller cannot see is no longer available');
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'A-1', null, null, 'none', null) $$, '42501', null, 'R10: viewers get forbidden, never a silent 0-row success');
select tests.authenticate_as(tests.user_id('out@test.dev'));
select throws_ok($$ select public.update_schedule_details(tests.schedule_id('A'), 'A', 'A-1', null, null, 'none', null) $$, '42501', null, 'R10: so do share recipients');

-- set_schedules_archived: R9, R10, R11
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok($$ select public.set_schedules_archived(array(select gen_random_uuid() from generate_series(1, 501)), true) $$, '23514', 'Select 500 schedules or fewer.', 'R9: at most 500 ids');
select throws_ok($$ select public.set_schedules_archived(array[tests.schedule_id('C'), tests.schedule_id('D')], false) $$, '23514', 'Select schedules from one project.', 'R9: ids from one project');
select throws_ok($$ select public.set_schedules_archived(array[tests.schedule_id('C'), gen_random_uuid()], false) $$, '23514', 'Some schedules are no longer available. Refresh and try again.', 'R9: every id must be found');
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok($$ select public.set_schedules_archived(array[tests.schedule_id('C')], false) $$, '42501', null, 'R10: viewers cannot restore');
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ select public.set_schedules_archived(array[tests.schedule_id('C')], false) $$, 'editors restore');
select results_eq($$ select archived_at is null, updated_at = now() from public.schedules where name = 'C' $$, $$ values (true, true) $$, 'R11: restoring moves updated_at');
select tests.clear_authentication();
update public.schedules set archived_at = '2026-02-01T00:00:00Z' where name = 'C';
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ select public.set_schedules_archived(array[tests.schedule_id('C')], true) $$, 'archiving an archived schedule');
select results_eq($$ select archived_at from public.schedules where name = 'C' $$, $$ values ('2026-02-01T00:00:00Z'::timestamptz) $$, 'keeps its first archive time');
select lives_ok($$ select public.set_schedules_archived(array[]::uuid[], true) $$, 'an empty list changes nothing');

-- delete_schedules and direct deletes: R3, R10
select throws_ok($$ select * from public.delete_schedules(array[tests.schedule_id('C')]) $$, '42501', null, 'R10: editors cannot delete schedules');
select tests.authenticate_as(tests.user_id('olive@test.dev'));
select throws_ok($$ select * from public.delete_schedules(array[tests.schedule_id('B')]) $$, '23514', 'Make another schedule current before deleting this one.', 'R3: not the current schedule while others stay');
select results_eq($$ select * from public.delete_schedules(array[tests.schedule_id('C')]) $$, $$ values ('crew/p1/c.xer'::text) $$, 'owners delete a schedule and get its stored path');
select lives_ok($$ select * from public.delete_schedules(array[tests.schedule_id('X3'), tests.schedule_id('Y3')]) $$, 'R3: the current schedule goes with every other one');
select lives_ok($$ select * from public.delete_schedules(array[tests.schedule_id('Y4'), tests.schedule_id('X4')]) $$, 'R3: in either order');
select lives_ok($$ delete from public.schedules where project_id = tests.project_id('P2') $$, 'R3: direct deletes are checked after the whole statement');
select throws_ok($$ delete from public.schedules where name = 'B' $$, '23514', 'Make another schedule current before deleting this one.', 'R3: a direct delete of the current schedule alone');
select lives_ok($$ delete from public.schedules where name = 'A' $$, 'a schedule that isn''t current');
select lives_ok($$ select * from public.delete_schedules(array[tests.schedule_id('B')]) $$, 'R3: the only schedule can go');

-- R5 on insert (P1 has no schedules left)
select tests.authenticate_as(tests.user_id('ed@test.dev'));
insert into public.schedules (project_id, name, code, source, baseline) values (tests.project_id('P1'), 'First baseline', 'FB-1', 'blank', 'baseline');
select results_eq($$ select baseline from public.schedules where name = 'First baseline' $$,
  $$ values ('primary'::text) $$, 'R5: an inserted baseline becomes the primary one when the project has none');
insert into public.schedules (project_id, name, code, source, baseline) values (tests.project_id('P1'), 'New primary', 'NP-1', 'blank', 'primary');
select results_eq($$ select name, baseline from public.schedules where project_id = tests.project_id('P1') order by name $$,
  $$ values ('First baseline'::text, 'baseline'::text), ('New primary', 'primary') $$, 'R5: an inserted primary baseline demotes the old one');

-- backfill_current_schedules on P2-shaped rows
select tests.clear_authentication();
insert into public.projects (workspace_id, code, name) values (tests.workspace_id('Crew'), 'OLD', 'Old project'), (tests.workspace_id('Crew'), 'TIE', 'Tie project');
alter table public.schedules disable trigger user;
insert into public.schedules (id, project_id, name, source, status_date, created_at, updated_at) values
  ('00000000-0000-0000-0000-00000000000a', tests.project_id('OLD'), 'Old one', 'blank', '2026-05-01', '2026-01-01', '2026-01-01'),
  ('00000000-0000-0000-0000-00000000000b', tests.project_id('OLD'), 'Old two', 'blank', '2026-06-01', '2026-01-02', '2026-01-02'),
  ('00000000-0000-0000-0000-00000000000c', tests.project_id('OLD'), 'Old none', 'blank', null, '2026-01-03', '2026-01-03'),
  ('00000000-0000-0000-0000-00000000000d', tests.project_id('TIE'), 'Tie low', 'blank', '2026-05-01', '2026-01-01', '2026-01-01'),
  ('00000000-0000-0000-0000-00000000000e', tests.project_id('TIE'), 'Tie high', 'blank', '2026-05-01', '2026-01-01', '2026-01-01');
alter table public.schedules enable trigger user;
select app.backfill_current_schedules();
select results_eq($$ select name from public.schedules where is_current and project_id in (tests.project_id('OLD'), tests.project_id('TIE')) order by name $$,
  $$ values ('Old two'::text), ('Tie high') $$, 'backfill: the latest status date, then the latest created_at, then the highest id');
select results_eq($$ select code, status_date from public.projects where code in ('OLD', 'TIE') order by code $$,
  $$ values ('OLD'::text, '2026-06-01'::date), ('TIE', '2026-05-01') $$, 'backfill: each project takes its current schedule''s status date');
select results_eq($$ select updated_at from public.schedules where name = 'Old two' $$, $$ values ('2026-01-02T00:00:00Z'::timestamptz) $$, 'backfill: updated_at stays (R11)');

select * from finish();
rollback;
