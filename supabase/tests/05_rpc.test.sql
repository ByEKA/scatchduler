begin;
\ir _helpers.psql
select plan(11);

do $$
declare v_olive uuid := tests.create_user('olive@test.dev'); v_ed uuid := tests.create_user('ed@test.dev');
        v_vi uuid := tests.create_user('vi@test.dev'); v_crew uuid := tests.team_workspace('Crew', v_olive);
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  perform tests.add_project(v_crew, 'PX1');
end $$;

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select results_eq($$ select name, kind, my_role, project_count from public.create_team_workspace('  Field crew ') $$,
  $$ values ('Field crew'::text, 'team'::text, 'owner'::text, 0) $$, 'anyone creates a team workspace and owns it');
select throws_ok($$ select public.create_team_workspace('x') $$, '23514', 'Use 2–40 characters', 'workspace names need 2–40 characters');
select is(public.is_project_code_available(tests.workspace_id('Crew'), ' px1 '), false, 'codes compare trimmed and case-insensitively');
select is(public.is_project_code_available(tests.workspace_id('Crew'), 'P_1'), true, 'an underscore is a literal character');
select throws_ok($$ select public.update_member_role(tests.workspace_id('Crew'), tests.user_id('vi@test.dev'), 'editor') $$, '42501', null, 'editors cannot change roles');

select tests.authenticate_as(tests.user_id('olive@test.dev'));
select lives_ok($$ select public.update_member_role(tests.workspace_id('Crew'), tests.user_id('vi@test.dev'), 'editor') $$, 'owners change roles');
select throws_ok($$ select public.update_member_role(tests.workspace_id('Crew'), tests.user_id('olive@test.dev'), 'editor') $$, '23514', 'A workspace needs at least one owner.', 'the last owner keeps the role');
select throws_ok($$ select public.remove_member(tests.workspace_id('Crew'), tests.user_id('olive@test.dev')) $$, '23514', 'A workspace needs at least one owner.', 'the last owner stays');
select lives_ok($$ select public.remove_member(tests.workspace_id('Crew'), tests.user_id('vi@test.dev')) $$, 'owners remove members');
select throws_ok($$ select public.remove_member(tests.workspace_id('Crew'), tests.user_id('vi@test.dev')) $$, '23514', 'This person is no longer a member.', 'removing twice says why');
select throws_ok($$ select public.remove_member(tests.personal_workspace(tests.user_id('olive@test.dev')), tests.user_id('olive@test.dev')) $$, '23514', 'A workspace needs at least one owner.', 'a personal workspace keeps its owner');

select tests.clear_authentication();
select * from finish();
rollback;
