-- Functions behind the `invitations` Edge Function (P2 spec §5.7, §6.6). Only the service role
-- may call them (§6.7); emails are trimmed and lowercased here too, so every caller agrees.

-- The auth account for an email, if any, and whether it was ever confirmed.
create function public.account_by_email(p_email text) returns table (user_id uuid, confirmed boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email_confirmed_at is not null
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
$$;

-- With p_user_id (a confirmed account): adds the membership and an already-accepted invitation as
-- the audit trail, in one transaction → 'added'. Without: upserts the single pending invitation
-- for (workspace, email), refreshing its role, inviter and created_at → 'pending'. PostgREST's own
-- upsert can't target the partial unique index, hence this function.
create function public.save_invitation(p_workspace_id uuid, p_email text, p_role text, p_invited_by uuid, p_user_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
begin
  if p_user_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, p_user_id, p_role);

    -- A pending invitation for the same email becomes the accepted one, so no stale row stays.
    update public.workspace_invitations i
    set role = p_role, invited_by = p_invited_by, accepted_at = now()
    where i.workspace_id = p_workspace_id and i.email = v_email
      and i.accepted_at is null and i.revoked_at is null;
    if not found then
      insert into public.workspace_invitations (workspace_id, email, role, invited_by, accepted_at)
      values (p_workspace_id, v_email, p_role, p_invited_by, now());
    end if;
    return 'added';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role, invited_by)
  values (p_workspace_id, v_email, p_role, p_invited_by)
  on conflict (workspace_id, email) where accepted_at is null and revoked_at is null
  do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
  return 'pending';
end
$$;

-- Privileges: new functions are executable by PUBLIC until revoked (Task 9 step 2).
revoke all on function public.account_by_email(text), public.save_invitation(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.account_by_email(text), public.save_invitation(uuid, text, text, uuid, uuid)
  to service_role;
