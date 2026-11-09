begin;
\ir _helpers.psql
select plan(28);

create function tests.import_path(p_code text, p_suffix text) returns text language sql stable security definer set search_path = '' as $$
  select p.workspace_id || '/' || p.id || '/' || gen_random_uuid() || '.' || p_suffix from public.projects p where p.code = p_code $$;
grant execute on function tests.import_path(text, text) to authenticated;

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive"}');
  v_ed uuid := tests.create_user('ed@test.dev', true, '{"first_name":"Ed"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_project(v_crew, 'P1');
  perform tests.add_project(v_crew, 'P2');
  insert into public.schedules (project_id, name, code, source) values (tests.project_id('P1'), 'Blank', 'BL', 'blank');
end $$;

-- backfill_import_formats on P2-shaped rows (the presence check is lifted inside this transaction)
alter table public.schedules drop constraint schedules_source_format_presence_check;
insert into public.schedules (project_id, name, source, source_file_name, source_file_path) values
  (tests.project_id('P2'), 'Old XER', 'import', 'Rev7.XER', 'old/a.xer'),
  (tests.project_id('P2'), 'Old XML', 'import', 'plan.xml', 'old/b.xml'),
  (tests.project_id('P2'), 'Old CSV', 'import', 'list.csv', 'old/c.csv');
select app.backfill_import_formats();
select results_eq($$ select name, source_format from public.schedules where name like 'Old %' order by name $$,
  $$ values ('Old CSV'::text, 'csv'::text), ('Old XER', 'xer'), ('Old XML', 'mspdi') $$, 'backfill: formats from the extensions P2 accepted');
insert into public.schedules (project_id, name, source, source_file_name, source_file_path) values (tests.project_id('P2'), 'Old MPP', 'import', 'plan.mpp', 'old/d.mpp');
select throws_like($$ select app.backfill_import_formats() $$, '%plan.mpp%', 'backfill: another extension stops the migration and names the row');
delete from public.schedules where name = 'Old MPP';
alter table public.schedules add constraint schedules_source_format_presence_check check ((source = 'import') = (source_format is not null));
select results_eq($$ select source_format, has_import_report, has_import_mapping from public.schedule_items where name = 'Old XER' $$,
  $$ values ('xer'::text, false, false) $$, 'P2-era imports have no report or mapping');

-- column checks, as the table owner
select throws_ok($$ insert into public.schedules (project_id, name, source, source_file_name) values (tests.project_id('P1'), 'No format', 'import', 'x.xer') $$, '23514', null, 'imports carry a source format');
select throws_ok($$ insert into public.schedules (project_id, name, source, source_format) values (tests.project_id('P1'), 'Blank xer', 'blank', 'xer') $$, '23514', null, 'blank schedules carry none');
select throws_ok($$ update public.schedules set source_format = 'mpp' where name = 'Old XER' $$, '23514', null, 'formats come from the list');
select throws_ok($$ update public.schedules set source_file_size = 0 where name = 'Old XER' $$, '23514', null, 'a stored original has at least one byte');
select throws_ok($$ update public.schedules set source_file_size = 20971521 where name = 'Old XER' $$, '23514', null, 'and at most 20 MB');
select throws_ok($$ update public.schedules set source_file_sha256 = 'ABC' where name = 'Old XER' $$, '23514', null, 'a SHA-256 is 64 lower-case hex digits');
select throws_ok($$ update public.schedules set source_project_code = repeat('x', 101) where name = 'Old XER' $$, '23514', null, 'source project codes have at most 100 characters');
select throws_ok($$ update public.schedules set parser_version = repeat('1', 21) where name = 'Old XER' $$, '23514', null, 'parser versions have at most 20 characters');
select throws_ok($$ update public.schedules set import_mapping = '[]'::jsonb where name = 'Old XER' $$, '23514', null, 'the mapping is an object');
select throws_ok($$ update public.schedules set import_report = jsonb_build_object('x', repeat('a', 262200)) where name = 'Old XER' $$, '23514', null, 'the report has at most 256 KB');
select throws_ok($$ update public.schedules set activity_count = 20001 where name = 'Old XER' $$, '23514', null, 'at most 20,000 activities');
select throws_ok($$ insert into public.schedules (project_id, name, source, source_format, source_file_path) values
  (tests.project_id('P1'), 'Dup 1', 'import', 'xer', 'dup/x.xer.gz'), (tests.project_id('P1'), 'Dup 2', 'import', 'xer', 'dup/x.xer.gz') $$,
  '23505', null, 'each stored object belongs to one schedule');

-- the path rule (user calls)
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path, source_file_size)
  values (tests.project_id('P1'), 'XER', 'I-1', 'import', 'xer', 'a.xer', tests.import_path('P1', 'xer.gz'), 10) $$, 'an XER is stored gzipped under its project');
select lives_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
  values (tests.project_id('P1'), 'XLSX', 'I-2', 'import', 'xlsx', 'a.xlsx', tests.import_path('P1', 'xlsx')) $$, 'an xlsx as it is');
select lives_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
  values (tests.project_id('P1'), 'XML', 'I-3', 'import', 'mspdi', 'a.xml', tests.import_path('P1', 'xml.gz')) $$, 'an MSPDI gzipped');
select lives_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
  values (tests.project_id('P1'), 'CSV', 'I-4', 'import', 'csv', 'a.csv', tests.import_path('P1', 'csv.gz')) $$, 'a CSV gzipped');
select throws_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
  values (tests.project_id('P1'), 'Plain', 'I-5', 'import', 'xer', 'a.xer', tests.import_path('P1', 'xer')) $$, '23514', null, 'the path rule refuses an uncompressed text file');
select throws_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
  values (tests.project_id('P1'), 'Mixed', 'I-6', 'import', 'mspdi', 'a.xml', tests.import_path('P1', 'xer.gz')) $$, '23514', null, 'the suffix must match the format');
select throws_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
  values (tests.project_id('P1'), 'Elsewhere', 'I-7', 'import', 'xer', 'a.xer', tests.import_path('P2', 'xer.gz')) $$, '23514', null, 'the path must be under the row''s project');
select throws_ok($$ insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
  values (tests.project_id('P1'), 'Odd', 'I-8', 'import', 'xer', 'a.xer', 'x/y/z.xer.gz') $$, '23514', null, 'other shapes are refused');
select throws_ok($$ update public.schedules set source_file_path = 'x' where name = 'XER' $$, '42501', null, 'users never change the stored path');
select throws_ok($$ update public.schedules set import_report = '{}' where name = 'XER' $$, '42501', null, 'nor the report');

-- schedule_items
select tests.clear_authentication();
update public.schedules set import_report = '{"schemaVersion":1}', import_mapping = '{"schemaVersion":1}' where name = 'XER';
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select results_eq($$ select name, source_format, has_import_report, has_import_mapping from public.schedule_items
  where project_id = tests.project_id('P1') and name in ('Blank', 'XER') order by name $$,
  $$ values ('Blank'::text, null::text, false, false), ('XER', 'xer', true, true) $$, 'schedule_items: the format, and whether a report and a mapping are stored');
select hasnt_column('public', 'schedule_items', 'import_report', 'schedule_items leaves the report out');
select hasnt_column('public', 'schedule_items', 'import_mapping', 'and the mapping');

select tests.clear_authentication();
select * from finish();
rollback;
