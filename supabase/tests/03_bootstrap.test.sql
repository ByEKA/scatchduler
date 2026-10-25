begin;
\ir _helpers.psql
select plan(10);

select tests.create_user('ada@test.dev', true, '{"first_name":"Ada","last_name":"Lovelace"}') as ada \gset
select results_eq($$ select first_name, last_name, email from public.profiles where id = tests.user_id('ada@test.dev') $$,
  $$ values ('Ada'::text, 'Lovelace'::text, 'ada@test.dev'::text) $$, 'a confirmed account gets a profile from its metadata');
select results_eq($$ select w.name, w.kind, m.role from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
                     where m.user_id = tests.user_id('ada@test.dev') $$,
  $$ values ('My workspace'::text, 'personal'::text, 'owner'::text) $$, 'and a personal workspace it owns');
select results_eq($$ select plan, trial_ends_at = now() + interval '336 hours' from public.subscriptions where user_id = tests.user_id('ada@test.dev') $$,
  $$ values ('trial'::text, true) $$, 'and a 14-day trial');

select tests.create_user('pending@test.dev', false) as pending \gset
select is_empty($$ select 1 from public.profiles where id = tests.user_id('pending@test.dev') $$, 'an unconfirmed account gets nothing yet');

do $$
declare v_crew uuid := tests.team_workspace('Crew', tests.user_id('ada@test.dev'));
        v_old uuid := tests.team_workspace('Old crew', tests.user_id('ada@test.dev'));
begin
  insert into public.workspace_invitations (workspace_id, email, role) values (v_crew, 'pending@test.dev', 'editor'), (v_crew, 'other@test.dev', 'viewer');
  insert into public.workspace_invitations (workspace_id, email, role, revoked_at) values (v_old, 'pending@test.dev', 'owner', now());
end $$;
update auth.users set email_confirmed_at = now() where id = tests.user_id('pending@test.dev');

select results_eq($$ select w.name, m.role from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
                     where m.user_id = tests.user_id('pending@test.dev') order by w.name $$,
  $$ values ('Crew'::text, 'editor'::text), ('My workspace'::text, 'owner'::text) $$, 'confirming accepts pending invitations, never revoked ones');
select ok((select accepted_at is not null from public.workspace_invitations where email = 'pending@test.dev' and revoked_at is null), 'the invitation is marked accepted');
select ok((select accepted_at is null from public.workspace_invitations where email = 'other@test.dev'), 'other emails'' invitations stay pending');

select tests.create_user('g@test.dev', true, '{"given_name":"Grace","family_name":"Hopper"}') as g \gset
select tests.create_user('f@test.dev', true, '{"full_name":"Alan Mathison Turing"}') as f \gset
select tests.create_user('n@test.dev', true, '{"name":"Hedy"}') as n \gset
select tests.create_user('x@test.dev', true, '{}') as x \gset
select results_eq($$ select email, first_name, last_name from public.profiles where email in ('f@test.dev', 'g@test.dev', 'n@test.dev', 'x@test.dev') order by email $$,
  $$ values ('f@test.dev'::text, 'Alan'::text, 'Mathison Turing'::text), ('g@test.dev', 'Grace', 'Hopper'), ('n@test.dev', 'Hedy', ''), ('x@test.dev', '', '') $$,
  'names fall back to given and family names, then a split full name, then empty');

update auth.users set email_confirmed_at = null where id = tests.user_id('ada@test.dev');
update auth.users set email_confirmed_at = now() where id = tests.user_id('ada@test.dev');
select is((select count(*)::int from public.workspaces where created_by = tests.user_id('ada@test.dev') and kind = 'personal'), 1, 'bootstrap runs once per account');

update auth.users set email = 'Ada.New@test.dev' where id = tests.user_id('ada@test.dev');
select is((select p.email from public.profiles p join auth.users u on u.id = p.id where u.email = 'Ada.New@test.dev'), 'ada.new@test.dev', 'the profile email follows the auth email, lowercased');

select * from finish();
rollback;
