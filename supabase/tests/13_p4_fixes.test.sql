begin;
\ir _helpers.psql
select plan(20);

create function tests.root_folder(p_code text, p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select f.id from public.folders f
  join public.projects p on p.id = f.project_id
  where p.code = p_code and f.parent_id is null and f.name = p_name
$$;

create function tests.data_path(p_schedule_name text) returns text
language sql stable security definer set search_path = '' as $$
  select p.workspace_id || '/' || s.project_id || '/' || s.id || '/' || gen_random_uuid() || '.json.gz'
  from public.schedules s
  join public.projects p on p.id = s.project_id
  where s.name = p_schedule_name
$$;

grant execute on function tests.root_folder(text, text), tests.data_path(text) to authenticated;

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive","last_name":"Owner"}');
  v_ed1 uuid := tests.create_user('ed1@test.dev', true, '{"first_name":"Ed","last_name":"One"}');
  v_ed2 uuid := tests.create_user('ed2@test.dev', true, '{"first_name":"Ed","last_name":"Two"}');
  v_nameless uuid := tests.create_user('nameless@test.dev', true, '{}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_p1 uuid;
  v_p2 uuid;
  v_p3 uuid;
  v_id uuid;
  v_sub uuid;
begin
  perform tests.add_member(v_crew, v_ed1, 'editor');
  perform tests.add_member(v_crew, v_ed2, 'editor');
  perform tests.add_member(v_crew, v_nameless, 'editor');
  v_p1 := tests.add_project(v_crew, 'P1');
  v_p2 := tests.add_project(v_crew, 'P2');
  v_p3 := tests.add_project(v_crew, 'P3');

  -- D5 layouts. P1: Updates > (updates, Q4 > Week 1); Site > (Archive, Old > archive).
  insert into public.folders (project_id, parent_id, name) values (v_p1, null, 'Updates') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'updates');
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'Q4') returning id into v_sub;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_sub, 'Week 1');
  insert into public.folders (project_id, parent_id, name) values (v_p1, null, 'Site') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'Archive');
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_id, 'Old') returning id into v_sub;
  insert into public.folders (project_id, parent_id, name) values (v_p1, v_sub, 'archive');
  -- P2: Plans, Drawings, Drawings (2); Plans > (Plans, drawings, Field).
  insert into public.folders (project_id, parent_id, name) values (v_p2, null, 'Drawings'), (v_p2, null, 'Drawings (2)');
  insert into public.folders (project_id, parent_id, name) values (v_p2, null, 'Plans') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p2, v_id, 'Plans'), (v_p2, v_id, 'drawings'), (v_p2, v_id, 'Field');
  -- P3: an 80-character name at the root and in Long.
  insert into public.folders (project_id, parent_id, name) values (v_p3, null, repeat('L', 80));
  insert into public.folders (project_id, parent_id, name) values (v_p3, null, 'Long') returning id into v_id;
  insert into public.folders (project_id, parent_id, name) values (v_p3, v_id, repeat('L', 80));

  -- R11 and R5 schedules. 'Current' is the project's first, so it is the current one.
  insert into public.schedules (project_id, name, code, source, status_date) values
    (v_p1, 'Current', 'CUR-1', 'blank', '2026-10-01'),
    (v_p1, 'Locked', 'LCK-1', 'blank', '2026-10-01'),
    (v_p1, 'Free', 'FRE-1', 'blank', '2026-10-01'),
    (v_p1, 'Expired', 'EXP-1', 'blank', '2026-10-01'),
    (v_p1, 'Saving', 'SAV-1', 'blank', '2026-10-01'),
    (v_p1, 'Nameless lock', 'NAM-1', 'blank', '2026-10-01');
  update public.schedules
    set locked_by = v_ed1, locked_at = now(), lock_expires_at = now() + interval '15 minutes'
    where name in ('Locked', 'Saving');
  update public.schedules
    set locked_by = v_ed1, locked_at = now() - interval '20 minutes', lock_expires_at = now() - interval '5 minutes'
    where name = 'Expired';
  update public.schedules
    set locked_by = v_nameless, locked_at = now(), lock_expires_at = now() + interval '15 minutes'
    where name = 'Nameless lock';
end $$;

-- 1-9. D5: deleting a folder always succeeds; clashing moved children get the lowest free " (n)".
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select lives_ok(
  $$ select public.delete_folder(tests.root_folder('P1', 'Updates')) $$,
  'D5: deleting a folder whose child has the same name succeeds');
select set_eq(
  $$ select name from public.folders where project_id = tests.project_id('P1') and parent_id is null $$,
  $$ values ('updates (2)'), ('Q4'), ('Site') $$,
  'D5: the child named like the deleted folder becomes "updates (2)"; the other child keeps its name');
select is(
  (select c.name from public.folders c where c.parent_id = tests.root_folder('P1', 'Q4')),
  'Week 1',
  'D5: a moved child keeps its own children');
select lives_ok(
  $$ select public.delete_folder((select id from public.folders where project_id = tests.project_id('P1') and name = 'Old')) $$,
  'D5: deleting a nested folder whose child clashes with a sibling succeeds');
select set_eq(
  $$ select name from public.folders where parent_id = tests.root_folder('P1', 'Site') $$,
  $$ values ('Archive'), ('archive (2)') $$,
  'D5: a child clashing with a folder at the parent level, ignoring case, becomes "archive (2)"');
select lives_ok(
  $$ select public.delete_folder(tests.root_folder('P2', 'Plans')) $$,
  'D5: deleting a folder with several clashing children succeeds');
select set_eq(
  $$ select name from public.folders where project_id = tests.project_id('P2') and parent_id is null $$,
  $$ values ('Drawings'), ('Drawings (2)'), ('drawings (3)'), ('Plans (2)'), ('Field') $$,
  'D5: several clashes take the lowest free numbers, 2 and 3');
select lives_ok(
  $$ select public.delete_folder(tests.root_folder('P3', 'Long')) $$,
  'D5: deleting a folder whose child has an 80-character clashing name succeeds');
select set_eq(
  $$ select name from public.folders where project_id = tests.project_id('P3') and parent_id is null $$,
  $$ values (repeat('L', 80)), (repeat('L', 76) || ' (2)') $$,
  'D5: a renamed name is cut so it stays within 80 characters');

-- 10-17. R11 in schedules_guard_update: direct writes obey the lock.
select tests.authenticate_as(tests.user_id('ed2@test.dev'));
select throws_ok(
  $$ update public.schedules set archived_at = now() where name = 'Locked' $$,
  '40001', 'This schedule is being edited by Ed One. Try again once they finish.',
  'R11: a direct archive by another editor is refused while the lock is active');
select throws_ok(
  $$ update public.schedules set status_date = '2026-10-20' where name = 'Locked' $$,
  '40001', 'This schedule is being edited by Ed One. Try again once they finish.',
  'R11: a direct status date change by another editor is refused while the lock is active');
select lives_ok(
  $$ update public.schedules set notes = 'Checked' where name = 'Locked' $$,
  'R11: other direct changes still work while the schedule is locked');
select lives_ok(
  $$ update public.schedules set archived_at = now(), status_date = '2026-10-20' where name = 'Free' $$,
  'R11: an unlocked schedule is archived and re-dated directly');
select lives_ok(
  $$ update public.schedules set archived_at = now() where name = 'Expired' $$,
  'R11: an expired lock does not block a direct archive');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select lives_ok(
  $$ update public.schedules set status_date = '2026-10-20', archived_at = now() where name = 'Locked' $$,
  'R11: the lock holder changes the status date and archives directly');
select tests.clear_authentication();
select lives_ok(
  $$ update public.schedules set status_date = '2026-10-21' where name = 'Saving' $$,
  'R11: writes without a signed-in user are not checked');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select results_eq(
  $$ select name, status_date, archived_at is not null, notes from public.schedules
     where name in ('Expired', 'Free', 'Locked', 'Saving') order by name $$,
  $$ values ('Expired'::text, '2026-10-01'::date, true, null::text),
            ('Free', '2026-10-20', true, null),
            ('Locked', '2026-10-20', true, 'Checked'),
            ('Saving', '2026-10-21', false, null) $$,
  'R11: the allowed direct writes changed their rows');

-- 18. R5: a NULL expected revision is a stale revision.
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select throws_ok(
  $$ select * from public.save_schedule_data(tests.schedule_id('Saving'), null, tests.data_path('Saving'), 3, 'calculated', '2026-10-01') $$,
  '40001', 'This schedule was changed elsewhere. Reload and try again.',
  'R5: save refuses a NULL expected revision');

-- 19-20. Display name: first and last name, else 'Another user', never the email.
select tests.clear_authentication();
select is(app.display_name(tests.user_id('nameless@test.dev')), 'Another user',
  'display_name: a user without a first or last name is "Another user", not the email');
select tests.authenticate_as(tests.user_id('ed1@test.dev'));
select is(
  (select locked_by_name from public.schedule_items where name = 'Nameless lock'),
  'Another user',
  'schedule_items names a lock holder without a name "Another user"');

select tests.clear_authentication();
select * from finish();
rollback;
