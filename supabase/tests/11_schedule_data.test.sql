begin;
\ir _helpers.psql
select plan(41);

create function tests.data_path(p_schedule_name text) returns text
language sql stable security definer set search_path = '' as $$
  select p.workspace_id || '/' || s.project_id || '/' || s.id || '/' || gen_random_uuid() || '.json.gz'
  from public.schedules s
  join public.projects p on p.id = s.project_id
  where s.name = p_schedule_name
$$;
grant execute on function tests.data_path(text) to authenticated;

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive","last_name":"Owner"}');
  v_ed1 uuid := tests.create_user('ed1@test.dev', true, '{"first_name":"Ed","last_name":"One"}');
  v_ed2 uuid := tests.create_user('ed2@test.dev', true, '{"first_name":"Ed","last_name":"Two"}');
  v_vi uuid := tests.create_user('vi@test.dev', true, '{"first_name":"Vi","last_name":"Viewer"}');
  v_out uuid := tests.create_user('out@test.dev', true, '{"first_name":"Out","last_name":"Share"}');
  v_sam uuid := tests.create_user('sam@test.dev', true, '{"first_name":"Sam","last_name":"Outsider"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_p1 uuid;
  v_cur uuid;
  v_arch uuid;
begin
  perform tests.add_member(v_crew, v_ed1, 'editor');
  perform tests.add_member(v_crew, v_ed2, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  perform tests.team_workspace('Other', v_sam);
  v_p1 := tests.add_project(v_crew, 'P1');
  insert into public.schedules (
    project_id, name, code, source, source_format, source_file_name, source_file_path,
    import_mapping, import_report, status_date, updated_at
  ) values (
    v_p1, 'Current', 'CUR-1', 'import', 'xer', 'orig.xer', 'imports/orig.xer.gz',
    '{"schemaVersion":1}'::jsonb, '{"schemaVersion":1}'::jsonb, '2026-10-01', '2026-01-01T00:00:00Z'
  ) returning id into v_cur;
  insert into public.schedules (project_id, name, code, source, archived_at)
    values (v_p1, 'Archived', 'ARC-1', 'blank', '2026-02-01T00:00:00Z') returning id into v_arch;
  insert into public.schedules (project_id, name, code, source, source_format, source_file_name, source_file_path)
    values (v_p1, 'DeleteMe', 'DEL-1', 'import', 'xer', 'del.xer', 'imports/del.xer.gz');
  insert into public.schedule_shares (schedule_id, shared_by, shared_with) values (v_cur, v_olive, v_out);
end $$;

-- 1–4. Column constraints and schedule_items security (table owner).
select throws_ok($$ update public.schedules set calculation_mode = 'raw' where name = 'Current' $$,
  '23514', null, 'calculation_mode is as_imported or calculated');
select throws_ok($$ update public.schedules set data_revision = -1 where name = 'Current' $$,
  '23514', null, 'data_revision is non-negative');
select throws_ok($$ update public.schedules set locked_by = tests.user_id('ed1@test.dev') where name = 'Current' $$,
  '23514', null, 'schedules_lock_triplet_check requires locked_at and lock_expires_at with locked_by');
select hasnt_column('public', 'schedule_items', 'data_file_path', 'schedule_items never exposes raw data_file_path');

-- 5–13. Lock lifecycle (R1, R2, R3, R4).
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select results_eq(
  $$ select user_id, user_name, expires_at = locked_at + interval '15 minutes'
     from public.acquire_schedule_lock(tests.schedule_id('Current')) $$,
  $$ values (tests.user_id('ed1@test.dev'), 'Ed One'::text, true) $$,
  'R1/R2: editor acquires a 15-minute lock');
select results_eq(
  $$ select locked_by, locked_by_name from public.schedule_items where name = 'Current' $$,
  $$ values (tests.user_id('ed1@test.dev'), 'Ed One'::text) $$,
  'schedule_items exposes active lock holder and display name');
select throws_ok(
  $$ select * from public.acquire_schedule_lock(tests.schedule_id('Archived')) $$,
  '23514', 'Restore this schedule before editing it.', 'R4: archived schedules cannot be locked');

select tests.authenticate_as(tests.user_id('ed2@test.dev'));
select throws_ok(
  $$ select * from public.acquire_schedule_lock(tests.schedule_id('Current')) $$,
  '40001', 'This schedule is being edited by Ed One.', 'R1: second editor sees active lock conflict');
select throws_ok(
  $$ select public.force_release_schedule_lock(tests.schedule_id('Current')) $$,
  '42501', null, 'R3: editors cannot force-release another user''s lock');

-- R11: locked by Ed One blocks Ed Two from changing status_date or archiving, while rename works.
select throws_ok(
  $$ select public.update_schedule_details(tests.schedule_id('Current'), 'Current', 'CUR-1', '2026-10-10', null, 'none', null) $$,
  '40001', 'This schedule is being edited by Ed One. Try again once they finish.',
  'R11: status_date change via details is refused while locked by another user');
select lives_ok(
  $$ select public.update_schedule_details(tests.schedule_id('Current'), 'Current', 'CUR-1', '2026-10-01', 'Note', 'none', null) $$,
  'R11: details save without status_date change still works while locked');

-- Expire Ed One's lock; Ed Two replaces it transparently (R1) and schedule_items hides expired locks.
select tests.clear_authentication();
update public.schedules set lock_expires_at = now() - interval '1 second' where name = 'Current';
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select results_eq(
  $$ select locked_by is null, locked_by_name is null from public.schedule_items where name = 'Current' $$,
  $$ values (true, true) $$, 'expired lock appears unlocked in schedule_items');
select throws_ok(
  $$ select * from public.renew_schedule_lock(tests.schedule_id('Current')) $$,
  '40001', 'Your edit lock expired. Copy your changes or reload the schedule.',
  'R2: renewing an expired lock fails with conflict copy');

-- 14–18. Replacement, renew, release, and owner force release.
select tests.authenticate_as(tests.user_id('ed2@test.dev'));
select results_eq(
  $$ select user_id, user_name from public.acquire_schedule_lock(tests.schedule_id('Current')) $$,
  $$ values (tests.user_id('ed2@test.dev'), 'Ed Two'::text) $$,
  'R1: second editor replaces expired lock');
select lives_ok(
  $$ select * from public.renew_schedule_lock(tests.schedule_id('Current')) $$,
  'R2: active lock holder renews lock');
select tests.authenticate_as(tests.user_id('olive@test.dev'));
select lives_ok(
  $$ select public.force_release_schedule_lock(tests.schedule_id('Current')) $$,
  'R3: workspace owner force-releases another user''s lock');
select results_eq(
  $$ select locked_by is null from public.schedule_items where name = 'Current' $$,
  $$ values (true) $$, 'force release clears lock');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select lives_ok($$ select * from public.acquire_schedule_lock(tests.schedule_id('Current')) $$, 'ed1 re-acquires lock');
select lives_ok($$ select public.release_schedule_lock(tests.schedule_id('Current')) $$, 'ed1 releases own lock');

-- 20–24. Materialize (R7, R8) and R10 immutability.
select tests.clear_authentication();
update public.schedules set updated_at = '2026-01-01T00:00:00Z' where name = 'Current';
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select throws_ok(
  $$ select public.materialize_schedule_data(tests.schedule_id('Current'), 'bad/path.json.gz', 10, 'as_imported') $$,
  '23514', null, 'R8: materialize rejects invalid data_file_path');
select is(
  public.materialize_schedule_data(tests.schedule_id('Current'), tests.data_path('Current'), 12, 'as_imported'),
  1, 'R7: materialize sets data_revision = 1');
select results_eq(
  $$ select data_revision, has_schedule_data, calculation_mode, activity_count, updated_at
     from public.schedule_items where name = 'Current' $$,
  $$ values (1, true, 'as_imported'::text, 12, '2026-01-01T00:00:00Z'::timestamptz) $$,
  'R7: materialize leaves updated_at unchanged');
select is(
  public.materialize_schedule_data(tests.schedule_id('Current'), tests.data_path('Current'), 99, 'calculated'),
  1, 'R7: materialize is idempotent once data_file_path is set');
select is((select activity_count from public.schedule_items where name = 'Current'), 12,
  'R7: second materialize keeps original snapshot metadata');

-- 25–30. Save (R5, R6, R8, R10).
select throws_ok(
  $$ select * from public.save_schedule_data(tests.schedule_id('Current'), 1, tests.data_path('Current'), 15, 'calculated', '2026-10-15') $$,
  '40001', 'Your edit lock expired. Copy your changes or reload the schedule.',
  'R5: save requires an active lock held by caller');
select lives_ok($$ select * from public.acquire_schedule_lock(tests.schedule_id('Current')) $$, 'acquire lock before save');
select throws_ok(
  $$ select * from public.save_schedule_data(tests.schedule_id('Current'), 0, tests.data_path('Current'), 15, 'calculated', '2026-10-15') $$,
  '40001', 'This schedule was changed elsewhere. Reload and try again.',
  'R5: save rejects stale expected_revision');
select results_eq(
  $$ select data_revision, previous_data_file_path is not null
     from public.save_schedule_data(tests.schedule_id('Current'), 1, tests.data_path('Current'), 15, 'calculated', '2026-10-15') $$,
  $$ values (2, true) $$, 'R5/R6: save increments revision and returns previous snapshot path');
select results_eq(
  $$ select s.data_revision, s.activity_count, s.calculation_mode, s.status_date, p.status_date,
            s.updated_at > '2026-01-01T00:00:00Z'::timestamptz
     from public.schedules s join public.projects p on p.id = s.project_id where s.name = 'Current' $$,
  $$ values (2, 15, 'calculated'::text, '2026-10-15'::date, '2026-10-15'::date, true) $$,
  'R6: save updates activity_count, calculation_mode, status_date (synced to project) and updated_at');
select results_eq(
  $$ select source_file_path, import_mapping, import_report from public.schedules where name = 'Current' $$,
  $$ values ('imports/orig.xer.gz'::text, '{"schemaVersion":1}'::jsonb, '{"schemaVersion":1}'::jsonb) $$,
  'R10: save never modifies source_file_path, import_mapping or import_report');

-- 31–34. Viewers, share recipients and outsiders (R3).
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select throws_ok($$ select * from public.acquire_schedule_lock(tests.schedule_id('Current')) $$, '42501', null, 'R3: viewer cannot lock');
select throws_ok($$ select public.materialize_schedule_data(tests.schedule_id('DeleteMe'), tests.data_path('DeleteMe'), 1, 'calculated') $$, '42501', null, 'R3: viewer cannot materialize');
select tests.authenticate_as(tests.user_id('out@test.dev'));
select throws_ok($$ select * from public.acquire_schedule_lock(tests.schedule_id('Current')) $$, '42501', null, 'R3: share recipient cannot lock');
select tests.authenticate_as(tests.user_id('sam@test.dev'));
select throws_ok($$ select * from public.acquire_schedule_lock(tests.schedule_id('Current')) $$, 'P0002', 'Schedule not found', 'outsider receives not_found');

-- 35–39. Storage RLS on schedule-data (R12, V5) and delete policy.
select tests.clear_authentication();
do $$
declare
  v_cur_path text := (select data_file_path from public.schedules where name = 'Current');
  v_orphan text := tests.data_path('Current');
  v_ed1 uuid := tests.user_id('ed1@test.dev');
begin
  insert into storage.objects (bucket_id, name, owner_id) values
    ('schedule-data', v_cur_path, v_ed1::text),
    ('schedule-data', v_orphan, v_ed1::text);
end $$;
select tests.authenticate_as(tests.user_id('out@test.dev'));
select is(
  (select count(*)::int from storage.objects where bucket_id = 'schedule-data'),
  1, 'R12/V5: share recipient reads the shared schedule snapshot');
select tests.authenticate_as(tests.user_id('sam@test.dev'));
select is(
  (select count(*)::int from storage.objects where bucket_id = 'schedule-data'),
  0, 'non-member reads zero schedule-data objects');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select set_config('storage.allow_delete_query', 'true', true);
with d as (
  delete from storage.objects
  where bucket_id = 'schedule-data'
    and name = (select data_file_path from public.schedules where name = 'Current')
  returning 1
) select is(count(*)::int, 0, 'editor cannot delete active snapshot in schedule-data') from d;
with d as (
  delete from storage.objects
  where bucket_id = 'schedule-data'
    and name <> (select data_file_path from public.schedules where name = 'Current')
  returning 1
) select is(count(*)::int, 1, 'editor can delete their own superseded snapshot') from d;

-- 40–41. R9 & R11: archiving locked schedule refused; owner deletes locked schedule returning both buckets.
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select lives_ok($$ select * from public.acquire_schedule_lock(tests.schedule_id('DeleteMe')) $$, 'ed1 locks DeleteMe');
select tests.clear_authentication();
update public.schedules set data_file_path = tests.data_path('DeleteMe') where name = 'DeleteMe';
select tests.authenticate_as(tests.user_id('ed2@test.dev'));
select throws_ok(
  $$ select public.set_schedules_archived(array[tests.schedule_id('DeleteMe')], true) $$,
  '40001', 'This schedule is being edited by Ed One. Try again once they finish.',
  'R11: archiving a schedule locked by another user is refused');
select tests.authenticate_as(tests.user_id('olive@test.dev'));
select results_eq(
  $$ select bucket from public.delete_schedules(array[tests.schedule_id('DeleteMe')]) order by bucket $$,
  $$ values ('schedule-data'::text), ('schedule-imports') $$,
  'R9/R11: owner deletes locked schedule and gets both bucket paths');

select tests.clear_authentication();
select * from finish();
rollback;
