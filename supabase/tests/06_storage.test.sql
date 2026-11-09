begin;
\ir _helpers.psql
select plan(7);
select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('project-covers', 'schedule-imports') order by id $$,
  $$ values ('project-covers'::text, false, 5242880::bigint, array['image/jpeg', 'image/png']::text[]), ('schedule-imports', false, 20971520::bigint, null::text[]) $$,
  'two private buckets with their limits');

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive"}');
  v_ed uuid := tests.create_user('ed@test.dev', true, '{"first_name":"Ed"}');
  v_vi uuid := tests.create_user('vi@test.dev', true, '{"first_name":"Vi"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_p uuid;
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  v_p := tests.add_project(v_crew, 'P1');
  insert into storage.objects (bucket_id, name, owner_id) values
    ('schedule-imports', v_crew || '/' || v_p || '/ref.xer.gz', v_ed::text),
    ('schedule-imports', v_crew || '/' || v_p || '/own.xer.gz', v_ed::text),
    ('schedule-imports', v_crew || '/' || v_p || '/theirs.xer.gz', v_olive::text);
  insert into public.schedules (project_id, name, source, source_format, source_file_name, source_file_path)
    values (v_p, 'Referenced', 'import', 'xer', 'ref.xer', v_crew || '/' || v_p || '/ref.xer.gz');
end $$;

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select throws_ok($$ delete from storage.objects where name like '%/own.xer.gz' $$, '42501', null, 'V7: SQL deletes are refused while the storage guard is on');
select set_config('storage.allow_delete_query', 'true', true);
with d as (delete from storage.objects where name like '%/ref.xer.gz' returning 1) select is(count(*)::int, 0, 'an editor cannot delete an object a schedule names') from d;
with d as (delete from storage.objects where name like '%/own.xer.gz' returning 1) select is(count(*)::int, 1, 'an editor deletes an unreferenced object they uploaded') from d;
with d as (delete from storage.objects where name like '%/theirs.xer.gz' returning 1) select is(count(*)::int, 0, 'but not someone else''s') from d;
select tests.authenticate_as(tests.user_id('vi@test.dev'));
with d as (delete from storage.objects where name like '%/theirs.xer.gz' returning 1) select is(count(*)::int, 0, 'viewers delete nothing') from d;
select tests.authenticate_as(tests.user_id('olive@test.dev'));
with d as (delete from storage.objects where name like '%/ref.xer.gz' returning 1) select is(count(*)::int, 1, 'owners delete any object of their workspace') from d;
select tests.clear_authentication();
select * from finish();
rollback;
