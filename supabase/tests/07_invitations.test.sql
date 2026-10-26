begin;
\ir _helpers.psql
select plan(9);

select function_privs_are('public', 'account_by_email', array['text'], 'authenticated', array[]::text[], 'signed-in users cannot look up accounts');
select function_privs_are('public', 'account_by_email', array['text'], 'anon', array[]::text[], 'nor can anon');
select function_privs_are('public', 'account_by_email', array['text'], 'service_role', array['EXECUTE'], 'the service role can');
select function_privs_are('public', 'save_invitation', array['uuid', 'text', 'text', 'uuid', 'uuid'], 'authenticated', array[]::text[], 'only the service role saves invitations');

do $$
begin
  perform tests.team_workspace('Crew', tests.create_user('olive@test.dev'));
  perform tests.create_user('pending@test.dev', false);
  perform tests.create_user('cara@test.dev');
end $$;
select results_eq($$ select confirmed from public.account_by_email(' PENDING@test.dev ') $$, $$ values (false) $$, 'lookups ignore case and spaces');
select is(public.save_invitation(tests.workspace_id('Crew'), 'pat@test.dev', 'editor', tests.user_id('olive@test.dev'), null), 'pending', 'a new email gets a pending invitation');
select is(public.save_invitation(tests.workspace_id('Crew'), 'pat@test.dev', 'viewer', tests.user_id('olive@test.dev'), null), 'pending', 'saving again keeps it pending');
select results_eq($$ select role from public.workspace_invitations where email = 'pat@test.dev' and accepted_at is null and revoked_at is null $$,
  $$ values ('viewer'::text) $$, 'with the latest role, in one row');
select is(public.save_invitation(tests.workspace_id('Crew'), 'cara@test.dev', 'editor', tests.user_id('olive@test.dev'), tests.user_id('cara@test.dev')), 'added', 'a confirmed account is added at once');

select * from finish();
rollback;
