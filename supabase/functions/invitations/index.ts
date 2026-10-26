// `invitations` Edge Function (Deno; P2 spec §5.7). Wires CORS, the Supabase service client and the
// auth admin calls to the decision logic in `logic.ts`. ESLint and tsc skip this file (spec §12).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleInvitations, type AuthAdmin, type InvitationsStore, type Outcome } from './logic.ts';

const DEFAULT_ORIGINS = 'http://localhost:5173,http://localhost:4174';

function allowedOrigins(): Set<string> {
  const value = (Deno.env.get('ALLOWED_ORIGINS') ?? '').trim() || DEFAULT_ORIGINS;
  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ''),
  );
}

const ORIGINS = allowedOrigins();
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// The legacy name is the one the runtime sets in every environment; the newer one is a fallback.
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin !== null && ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(outcome: Outcome, origin: string | null): Response {
  return new Response(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

const pending = <Q extends { is(column: string, value: null): Q }>(query: Q): Q =>
  query.is('accepted_at', null).is('revoked_at', null);

const store: InvitationsStore = {
  async isOwner(workspaceId, userId) {
    const row = check(
      await admin
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle(),
    );
    return row?.role === 'owner';
  },
  async workspace(workspaceId) {
    const row = check(
      await admin.from('workspaces').select('name, kind').eq('id', workspaceId).maybeSingle(),
    );
    return row ? { name: row.name, kind: row.kind } : null;
  },
  async account(email) {
    const rows = check(await admin.rpc('account_by_email', { p_email: email })) as
      { user_id: string; confirmed: boolean }[] | null;
    const row = rows?.[0];
    return row ? { userId: row.user_id, confirmed: row.confirmed } : null;
  },
  async isMember(workspaceId, userId) {
    const { count, error } = await admin
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);
    if (error) throw error;
    return (count ?? 0) > 0;
  },
  async saveInvitation({ workspaceId, email, role, invitedBy, userId }) {
    const result = check(
      await admin.rpc('save_invitation', {
        p_workspace_id: workspaceId,
        p_email: email,
        p_role: role,
        p_invited_by: invitedBy,
        p_user_id: userId,
      }),
    );
    return result === 'added' ? 'added' : 'pending';
  },
  async pendingInvitation(id) {
    const row = check(
      await pending(
        admin.from('workspace_invitations').select('id, workspace_id, email').eq('id', id),
      ).maybeSingle(),
    );
    return row ? { id: row.id, workspaceId: row.workspace_id, email: row.email } : null;
  },
  async revoke(id) {
    check(
      await pending(
        admin
          .from('workspace_invitations')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', id),
      ),
    );
  },
  async countOtherPending(email, exceptId) {
    const { count, error } = await pending(
      admin
        .from('workspace_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('email', email)
        .neq('id', exceptId),
    );
    if (error) throw error;
    return count ?? 0;
  },
  async displayName(userId) {
    const row = check(
      await admin
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userId)
        .maybeSingle(),
    );
    if (!row) return '';
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    return name || row.email;
  },
};

const authAdmin: AuthAdmin = {
  async setMetadata(userId, data) {
    const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: data });
    if (error) throw error;
  },
  async invite(email, data) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { data });
    if (!error) return 'sent';
    if (error.status === 429) return 'rate_limited';
    throw error;
  },
  async deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  },
};

async function callerId(request: Request): Promise<string | null> {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '');
  if (!match) return null;
  const { data, error } = await admin.auth.getUser(match[1]);
  return error || !data.user ? null : data.user.id;
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    const allowed = origin !== null && ORIGINS.has(origin);
    return new Response(null, { status: allowed ? 204 : 403, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') {
    return json({ status: 405, body: { message: 'Method not allowed.' } }, origin);
  }
  try {
    const caller = await callerId(request);
    const body: unknown = await request.json().catch(() => null);
    return json(await handleInvitations(caller, body, { store, admin: authAdmin }), origin);
  } catch (error) {
    console.error('invitations failed', error);
    return json({ status: 500, body: { message: 'Something went wrong. Try again.' } }, origin);
  }
});
