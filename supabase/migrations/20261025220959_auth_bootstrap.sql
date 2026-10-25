-- Account bootstrap (P2 spec §5.6, §6.6, D12): an account gets its profile, personal workspace,
-- trial and pending invitations when it is confirmed, not when the auth row is created (an admin
-- invite creates the auth user at once). The auth.users triggers run as Supabase Auth's own
-- database role, so every function here is a definer with an empty search_path.

-- Runs P2 spec §5.6 steps 1–4 once per account; returns at once when the profile exists.
create function app.bootstrap_account(p_user_id uuid, p_email text, p_meta jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_email text := lower(coalesce(p_email, ''));
  v_first text := trim(coalesce(v_meta ->> 'first_name', ''));
  v_last text := trim(coalesce(v_meta ->> 'last_name', ''));
  v_full text;
  v_space int;
  v_workspace_id uuid;
begin
  -- 1. Names: first / last name, else given / family name, else full name (then name) split at
  -- the first space, else empty strings. Each name is cut to 60 characters.
  if v_first = '' and v_last = '' then
    v_first := trim(coalesce(v_meta ->> 'given_name', ''));
    v_last := trim(coalesce(v_meta ->> 'family_name', ''));
  end if;
  if v_first = '' and v_last = '' then
    v_full := trim(coalesce(nullif(trim(coalesce(v_meta ->> 'full_name', '')), ''), v_meta ->> 'name', ''));
    v_space := strpos(v_full, ' ');
    if v_space = 0 then
      v_first := v_full;
    else
      v_first := left(v_full, v_space - 1);
      v_last := trim(substr(v_full, v_space + 1));
    end if;
  end if;

  insert into public.profiles (id, first_name, last_name, email)
  values (p_user_id, left(v_first, 60), left(v_last, 60), v_email)
  on conflict (id) do nothing;
  if not found then
    return; -- already bootstrapped
  end if;

  -- 2. The personal workspace and its owner membership.
  insert into public.workspaces (name, kind, created_by)
  values ('My workspace', 'personal', p_user_id)
  returning id into v_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner');

  -- 3. A 14-day trial (exact hours: no daylight-saving drift).
  insert into public.subscriptions (user_id, plan, trial_ends_at)
  values (p_user_id, 'trial', now() + interval '336 hours');

  -- 4. Accept the pending invitations for this email.
  insert into public.workspace_members (workspace_id, user_id, role)
  select i.workspace_id, p_user_id, i.role
  from public.workspace_invitations i
  where i.email = v_email and i.accepted_at is null and i.revoked_at is null
  on conflict do nothing;
  update public.workspace_invitations i
  set accepted_at = now()
  where i.email = v_email and i.accepted_at is null and i.revoked_at is null;
end
$$;

-- Seeded or admin-created users can be confirmed when the row is inserted.
create function app.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    perform app.bootstrap_account(new.id, new.email, new.raw_user_meta_data);
  end if;
  return null;
end
$$;

-- An invite, recovery or Google sign-in confirmed the account.
create function app.on_auth_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.bootstrap_account(new.id, new.email, new.raw_user_meta_data);
  return null;
end
$$;

-- profiles.email follows auth.users.email.
create function app.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return null;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.on_auth_user_created();
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function app.on_auth_user_confirmed();
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.sync_profile_email();

-- Privileges: new functions are executable by PUBLIC until revoked. Triggers still fire, because
-- a trigger never checks EXECUTE for the role that fires it.
revoke execute on function app.bootstrap_account(uuid, text, jsonb), app.on_auth_user_created(),
  app.on_auth_user_confirmed(), app.sync_profile_email() from public, anon, authenticated;
