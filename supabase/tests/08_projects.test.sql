begin;
\ir _helpers.psql
select plan(26);

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive"}');
  v_ed uuid := tests.create_user('ed@test.dev', true, '{"first_name":"Ed"}');
  v_vi uuid := tests.create_user('vi@test.dev', true, '{"first_name":"Vi"}');
  v_out uuid := tests.create_user('out@test.dev', true, '{"first_name":"Out"}');
  v_sam uuid := tests.create_user('sam@test.dev', true, '{"first_name":"Sam"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_doomed uuid;
  v_plan uuid;
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  perform tests.team_workspace('Other', v_sam);
  perform tests.add_project(v_crew, 'P1');
  v_doomed := tests.add_project(v_crew, 'D1');
  update public.projects set cover_image_path = 'covers/d1.jpg' where id = v_doomed;
  insert into public.schedules (project_id, name, source, source_format, source_file_name, source_file_path)
    values (v_doomed, 'Doomed plan', 'import', 'xer', 'd1.xer', 'imports/d1.xer') returning id into v_plan;
  insert into public.schedules (project_id, name, source) values (v_doomed, 'Doomed blank', 'blank');
  insert into public.schedule_shares (schedule_id, shared_by, shared_with) values (v_plan, v_olive, v_out);
  insert into public.tasks (assignee_id, project_id, title) values (v_ed, v_doomed, 'Check the doomed plan');
end $$;

-- columns and checks, as the table owner
select results_eq($$ select status, stage, sector, location_lat, location_lng from public.projects where code = 'P1' $$,
  $$ values ('active'::text, null::text, null::text, null::numeric, null::numeric) $$, 'a new project is active, without stage, sector or coordinates');
select throws_ok($$ update public.projects set status = 'paused' where code = 'P1' $$, '23514', null, 'statuses come from the list');
select throws_ok($$ update public.projects set stage = 'design' where code = 'P1' $$, '23514', null, 'stages come from the list');
select throws_ok($$ update public.projects set sector = 'mixed' where code = 'P1' $$, '23514', null, 'sectors come from the list');
select throws_ok($$ update public.projects set project_type = 'space' where code = 'P1' $$, '23514', null, 'project types come from the list');
select lives_ok($$ update public.projects set status = 'on_hold', stage = 'closeout', sector = 'public_private', project_type = 'energy' where code = 'P1' $$, 'the new values are stored');
select lives_ok($$ update public.projects set project_type = 'transportation' where code = 'P1' $$, 'transportation is a project type');
select lives_ok($$ update public.projects set project_type = 'water' where code = 'P1' $$, 'water is a project type');
select throws_ok($$ update public.projects set location_lat = 41.0151 where code = 'P1' $$, '23514',
  'new row for relation "projects" violates check constraint "projects_location_pair_check"', 'a latitude needs a longitude');
select throws_ok($$ update public.projects set location_lat = 91, location_lng = 0 where code = 'P1' $$, '23514', null, 'latitudes stay within -90 and 90');
select throws_ok($$ update public.projects set location_lat = 0, location_lng = 181 where code = 'P1' $$, '23514', null, 'longitudes stay within -180 and 180');
select lives_ok($$ update public.projects set location_lat = 41.0151, location_lng = -28.9795 where code = 'P1' $$, 'a coordinate pair is stored');
select results_eq($$ select location_lat::text, location_lng::text from public.projects where code = 'P1' $$,
  $$ values ('41.015100', '-28.979500') $$, 'coordinates keep six decimals');

-- R11: status_date is not in the trigger's column list
update public.projects set updated_at = '2026-01-01T00:00:00Z' where code = 'P1';
select tests.authenticate_as(tests.user_id('ed@test.dev'));
update public.projects set status_date = '2026-03-01' where code = 'P1';
select is((select updated_at from public.projects where code = 'P1'), '2026-01-01T00:00:00Z'::timestamptz, 'R11: a status date write leaves updated_at alone');
update public.projects set status = 'completed' where code = 'P1';
select is((select updated_at from public.projects where code = 'P1'), now(), 'R11: a status write moves updated_at');
select tests.clear_authentication();
update public.projects set updated_at = '2026-01-01T00:00:00Z' where code = 'P1';
select tests.authenticate_as(tests.user_id('ed@test.dev'));
update public.projects set location_lat = 40, location_lng = 29 where code = 'P1';
select is((select updated_at from public.projects where code = 'P1'), now(), 'R11: a coordinate write moves updated_at');

-- R10, R12: delete_project
select throws_ok($$ select * from public.delete_project(tests.project_id('D1')) $$, '42501', null, 'R10: editors cannot delete projects');
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok($$ select * from public.delete_project(tests.project_id('D1')) $$, '42501', null, 'R10: nor can viewers');
select tests.authenticate_as(tests.user_id('out@test.dev'));
select throws_ok($$ select * from public.delete_project(tests.project_id('D1')) $$, '42501', null, 'R10: nor a share recipient, who sees the project');
select tests.authenticate_as(tests.user_id('sam@test.dev'));
select throws_ok($$ select * from public.delete_project(tests.project_id('D1')) $$, 'P0002', 'Project not found', 'a project the caller cannot see is not found');
select throws_ok($$ select * from public.delete_project(gen_random_uuid()) $$, 'P0002', 'Project not found', 'nor is an unknown one');
select tests.authenticate_as(tests.user_id('olive@test.dev'));
select results_eq($$ select bucket, path from public.delete_project(tests.project_id('D1')) order by bucket $$,
  $$ values ('project-covers'::text, 'covers/d1.jpg'::text), ('schedule-imports', 'imports/d1.xer') $$,
  'R12: owners delete a project and get its stored objects back');
select tests.clear_authentication();
select is_empty($$ select 1 from public.projects where code = 'D1' $$, 'R12: the project is gone');
select is_empty($$ select 1 from public.schedules where name like 'Doomed%' $$, 'R12: with its schedules');
select is_empty($$ select 1 from public.schedule_shares where shared_with = tests.user_id('out@test.dev') $$, 'R12: and their shares');
select results_eq($$ select project_id is null from public.tasks where title = 'Check the doomed plan' $$, $$ values (true) $$, 'tasks stay, without the project');

select * from finish();
rollback;
