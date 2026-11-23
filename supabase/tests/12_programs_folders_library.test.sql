begin;
\ir _helpers.psql
select plan(43);

create function tests.copy_import_path(p_code text, p_suffix text) returns text
language sql stable security definer set search_path = '' as $$
  select p.workspace_id || '/' || p.id || '/' || gen_random_uuid() || '.' || p_suffix
  from public.projects p where p.code = p_code
$$;

create function tests.copy_data_path(p_code text, p_schedule_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select p.workspace_id || '/' || p.id || '/' || p_schedule_id || '/' || gen_random_uuid() || '.json.gz'
  from public.projects p where p.code = p_code
$$;

create function tests.folder_id(p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select f.id from public.folders f where f.name = p_name limit 1
$$;

grant execute on function tests.copy_import_path(text, text), tests.copy_data_path(text, uuid), tests.folder_id(text) to authenticated;

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive","last_name":"Owner"}');
  v_ed uuid := tests.create_user('ed@test.dev', true, '{"first_name":"Ed","last_name":"Editor"}');
  v_vi uuid := tests.create_user('vi@test.dev', true, '{"first_name":"Vi","last_name":"Viewer"}');
  v_sam uuid := tests.create_user('sam@test.dev', true, '{"first_name":"Sam","last_name":"Outsider"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_other uuid := tests.team_workspace('Other', v_sam);
  v_p1 uuid;
  v_p2 uuid;
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  v_p1 := tests.add_project(v_crew, 'P1');
  v_p2 := tests.add_project(v_crew, 'P2');
  perform tests.add_project(v_other, 'OP1');

  insert into public.schedules (project_id, name, code, source, status_date, notes, activity_count, calculation_mode)
    values (v_p1, 'Master', 'MS-01', 'blank', '2026-10-10', 'Base notes', 6, 'calculated');
end $$;

-- 1. Programs: R1 & R2
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok(
  $$ select public.create_program(tests.workspace_id('Crew'), 'Waterfront') $$,
  '42501', 'Only editors and owners can manage programs.',
  'R1: viewers cannot create a program'
);

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok(
  $$ select public.create_program(tests.workspace_id('Crew'), '   ') $$,
  '23514', 'Enter a program name.',
  'R1: blank program name is refused'
);
select throws_ok(
  $$ select public.create_program(tests.workspace_id('Crew'), repeat('a', 81)) $$,
  '23514', 'Use 80 characters or fewer.',
  'R1: program name over 80 chars is refused'
);
select lives_ok(
  $$ select public.create_program(tests.workspace_id('Crew'), ' Waterfront ') $$,
  'R1: editor creates a program'
);
select is(
  (select name from public.programs where workspace_id = tests.workspace_id('Crew')),
  'Waterfront',
  'R1: program name is trimmed on create'
);
select throws_ok(
  $$ select public.create_program(tests.workspace_id('Crew'), 'waterfront') $$,
  '23505', null,
  'R1: program names are unique per workspace ignoring case'
);

-- Assign project to program and check project_summaries
select lives_ok(
  $$ update public.projects
     set program_id = (select id from public.programs where name = 'Waterfront')
     where code = 'P1' $$,
  'R2: editor assigns project to program in the same workspace'
);
select is(
  (select program_name from public.project_summaries where code = 'P1'),
  'Waterfront',
  'project_summaries exposes program_name'
);

-- Cross-workspace program assignment rejected (as table owner)
select tests.clear_authentication();
insert into public.programs (workspace_id, name) values (tests.workspace_id('Other'), 'OtherProg');
select throws_ok(
  $$ update public.projects
     set program_id = (select id from public.programs where name = 'OtherProg')
     where code = 'P1' $$,
  '23514', 'Choose a program in this workspace.',
  'R2: a project cannot reference a program from another workspace'
);

-- Rename and delete program (R1)
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok(
  $$ select public.rename_program(
       (select id from public.programs where name = 'Waterfront'),
       ' Marine & Ports '
     ) $$,
  'R1: editor renames a program'
);
select is(
  (select program_name from public.project_summaries where code = 'P1'),
  'Marine & Ports',
  'renamed program appears in project_summaries'
);
select throws_ok(
  $$ select public.delete_program((select id from public.programs where name = 'Marine & Ports')) $$,
  '42501', 'Only workspace owners can delete programs.',
  'R1: editors cannot delete a program'
);

select tests.clear_authentication();
update public.projects set updated_at = '2026-01-01T00:00:00Z' where code = 'P1';
select tests.authenticate_as(tests.user_id('olive@test.dev'));
select lives_ok(
  $$ select public.delete_program((select id from public.programs where name = 'Marine & Ports')) $$,
  'R1: workspace owner deletes a program'
);
select results_eq(
  $$ select program_id is null, updated_at = '2026-01-01T00:00:00Z'::timestamptz
     from public.projects where code = 'P1' $$,
  $$ values (true, true) $$,
  'R1: deleting a program clears project.program_id without changing project.updated_at'
);

-- 2. Folders: R3, R4, R5
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok(
  $$ select public.create_folder(tests.project_id('P1'), null, 'Baselines') $$,
  '42501', 'Only editors and owners can manage folders.',
  'R3: viewers cannot create folders'
);

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok(
  $$ select public.create_folder(tests.project_id('P1'), null, '  ') $$,
  '23514', 'Enter a folder name.',
  'R3: blank folder name is refused'
);
select lives_ok(
  $$ select public.create_folder(tests.project_id('P1'), null, ' Updates ') $$,
  'R3: editor creates root folder'
);
select throws_ok(
  $$ select public.create_folder(tests.project_id('P1'), null, 'updates') $$,
  '23505', null,
  'R3: sibling folder names are unique ignoring case'
);
select lives_ok(
  $$ select public.create_folder(
       tests.project_id('P1'),
       (select id from public.folders where name = 'Updates'),
       '2026'
     ) $$,
  'R3: editor creates level-2 subfolder'
);
select lives_ok(
  $$ select public.create_folder(
       tests.project_id('P1'),
       (select id from public.folders where name = '2026'),
       'Q4'
     ) $$,
  'R3: editor creates level-3 subfolder'
);
select throws_ok(
  $$ select public.create_folder(
       tests.project_id('P1'),
       (select id from public.folders where name = 'Q4'),
       'October'
     ) $$,
  '23514', 'Folders can be nested up to 3 levels deep.',
  'R3: 4th level folder nesting is refused'
);
select throws_ok(
  $$ select public.create_folder(
       tests.project_id('P2'),
       (select id from public.folders where name = 'Updates'),
       'CrossProject'
     ) $$,
  '23514', 'Choose a folder in this project.',
  'R3: parent folder must belong to the same project'
);

-- Move schedules to folder (R5)
select tests.clear_authentication();
update public.schedules set updated_at = '2026-01-01T00:00:00Z' where name = 'Master';
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok(
  $$ select public.move_schedules_to_folder(
       array[tests.schedule_id('Master')],
       (select id from public.folders where name = '2026')
     ) $$,
  '42501', 'Only editors and owners can move schedules.',
  'R5: viewers cannot move schedules to a folder'
);

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok(
  $$ select public.move_schedules_to_folder(
       array[tests.schedule_id('Master')],
       (select id from public.folders where name = '2026')
     ) $$,
  'R5: editor moves schedule into folder 2026'
);
select results_eq(
  $$ select folder_id = (select id from public.folders where name = '2026'),
            updated_at = '2026-01-01T00:00:00Z'::timestamptz
     from public.schedule_items where name = 'Master' $$,
  $$ values (true, true) $$,
  'R5: schedule_items exposes folder_id and moving leaves updated_at unchanged'
);

-- Rename and delete folder (R4)
select lives_ok(
  $$ select public.rename_folder(
       (select id from public.folders where name = '2026'),
       ' 2026 Archive '
     ) $$,
  'R3: editor renames folder'
);
select is(
  (select name from public.folders where id = (select folder_id from public.schedules where name = 'Master')),
  '2026 Archive',
  'R3: folder name is trimmed on rename'
);

select lives_ok(
  $$ select public.delete_folder((select id from public.folders where name = '2026 Archive')) $$,
  'R4: editor deletes non-empty folder'
);
select results_eq(
  $$ select (select parent_id from public.folders where name = 'Q4') = (select id from public.folders where name = 'Updates'),
            (select folder_id from public.schedules where name = 'Master') = (select id from public.folders where name = 'Updates'),
            (select updated_at from public.schedules where name = 'Master') = '2026-01-01T00:00:00Z'::timestamptz $$,
  $$ values (true, true, true) $$,
  'R4: deleting a folder re-parents its subfolders and schedules to its parent without changing schedules.updated_at'
);

-- 3. Copy schedule: R6
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok(
  $$ select public.copy_schedule(
       tests.schedule_id('Master'),
       gen_random_uuid(),
       'Master copy',
       'MS-01-COPY',
       null,
       true,
       null,
       null
     ) $$,
  '42501', 'Only editors and owners can duplicate schedules.',
  'R6: viewers cannot duplicate a schedule'
);

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok(
  $$ select public.copy_schedule(
       tests.schedule_id('Master'),
       gen_random_uuid(),
       'Master copy',
       'ms-01',
       null,
       true,
       null,
       null
     ) $$,
  '23505', null,
  'R6: duplicate code in the same project is refused'
);

select is(
  public.copy_schedule(
    tests.schedule_id('Master'),
    '11111111-1111-1111-1111-111111111111'::uuid,
    ' Master copy ',
    ' MS-01-COPY ',
    null,
    true,
    null,
    null
  ),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'R6: copy_schedule returns the new schedule id'
);

select results_eq(
  $$ select name, code, is_current, baseline, update_number,
            copied_from_id = tests.schedule_id('Master'),
            folder_id = (select id from public.folders where name = 'Updates'),
            status_date, notes, activity_count, data_revision, has_schedule_data
     from public.schedule_items where code = 'MS-01-COPY' $$,
  $$ values ('Master copy'::text, 'MS-01-COPY'::text, false, 'none'::text, null::int,
             true, true, '2026-10-10'::date, 'Base notes'::text, 6, 0, false) $$,
  'R6: copied blank schedule inherits source fields, folder and copied_from_id, and starts non-current'
);

-- Copy materialized imported schedule with new source_file_path and data_file_path
select tests.clear_authentication();
insert into public.schedules (
  id, project_id, name, code, source, source_format, source_file_name, source_file_path,
  source_file_size, source_file_sha256, source_project_code, parser_version,
  import_mapping, import_report, activity_count, data_file_path, calculation_mode
) values (
  '22222222-2222-2222-2222-222222222222'::uuid,
  tests.project_id('P1'), 'Imported XER', 'IMP-01', 'import', 'xer', 'plant.xer',
  tests.copy_import_path('P1', 'xer.gz'), 1024, repeat('a', 64), 'PLANT', '1',
  '{"schemaVersion":1}'::jsonb, '{"schemaVersion":1}'::jsonb, 14,
  tests.copy_data_path('P1', '22222222-2222-2222-2222-222222222222'::uuid), 'as_imported'
);

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok(
  $$ select public.copy_schedule(
       '22222222-2222-2222-2222-222222222222'::uuid,
       '33333333-3333-3333-3333-333333333333'::uuid,
       'Imp Copy',
       'IMP-02',
       null,
       false,
       null,
       tests.copy_data_path('P1', '33333333-3333-3333-3333-333333333333'::uuid)
     ) $$,
  '23514', 'The stored file path doesn''t match the schedule.',
  'R6: copying a schedule with a stored original requires a new source_file_path'
);

select throws_ok(
  $$ select public.copy_schedule(
       '22222222-2222-2222-2222-222222222222'::uuid,
       '33333333-3333-3333-3333-333333333333'::uuid,
       'Imp Copy',
       'IMP-02',
       null,
       false,
       tests.copy_import_path('P1', 'xer.gz'),
       null
     ) $$,
  '23514', 'The stored schedule data path doesn''t match the schedule.',
  'R6: copying a materialized schedule requires a new data_file_path'
);

select lives_ok(
  $$ select public.copy_schedule(
       '22222222-2222-2222-2222-222222222222'::uuid,
       '33333333-3333-3333-3333-333333333333'::uuid,
       'Imp Copy',
       'IMP-02',
       null,
       false,
       tests.copy_import_path('P1', 'xer.gz'),
       tests.copy_data_path('P1', '33333333-3333-3333-3333-333333333333'::uuid)
     ) $$,
  'R6: copies materialized imported schedule with new source and snapshot paths'
);

select results_eq(
  $$ select source, source_format, source_file_name, has_import_report, has_import_mapping,
            has_schedule_data, data_revision, calculation_mode, folder_id is null
     from public.schedule_items where code = 'IMP-02' $$,
  $$ values ('import'::text, 'xer'::text, 'plant.xer'::text, true, true, true, 1, 'as_imported'::text, true) $$,
  'R6: copied imported schedule preserves report, mapping, snapshot revision 1 and explicit null folder'
);

-- Outsider isolation on programs and folders (R7 / S2)
select tests.authenticate_as(tests.user_id('sam@test.dev'));
select is_empty(
  $$ select 1 from public.folders where project_id = tests.project_id('P1') $$,
  'S2: outsiders cannot read folders of another workspace'
);
select throws_ok(
  $$ select public.create_program(tests.workspace_id('Crew'), 'Intrude') $$,
  '42501', 'Only editors and owners can manage programs.',
  'S2: outsiders cannot create programs in another workspace'
);
select throws_ok(
  $$ select public.create_folder(tests.project_id('P1'), null, 'Intrude') $$,
  'P0002', 'Project not found',
  'S2: outsiders receive not_found on create_folder for hidden project'
);
select throws_ok(
  $$ select public.rename_folder(tests.folder_id('Updates'), 'Hack') $$,
  'P0002', 'Folder not found',
  'S2: outsiders receive not_found on rename_folder for hidden folder'
);
select throws_ok(
  $$ select public.delete_folder(tests.folder_id('Updates')) $$,
  'P0002', 'Folder not found',
  'S2: outsiders receive not_found on delete_folder for hidden folder'
);
select throws_ok(
  $$ select public.copy_schedule(tests.schedule_id('Master'), gen_random_uuid(), 'Steal', 'ST-1', null, true, null, null) $$,
  'P0002', 'Schedule not found',
  'S2: outsiders receive not_found on copy_schedule for hidden schedule'
);

select tests.clear_authentication();
select * from finish();
rollback;
