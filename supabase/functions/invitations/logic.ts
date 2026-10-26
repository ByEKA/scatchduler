// Decision logic of the `invitations` Edge Function (P2 spec §5.7). No imports at all: validation is
// hand-written and data access is injected, so Vitest runs it without Deno or the network.
// `index.ts` wires CORS, the Supabase clients and the admin calls.

export type Role = 'owner' | 'editor' | 'viewer';

export type InvitationRequest =
  | { action: 'invite'; workspaceId: string; email: string; role: Role }
  | { action: 'revoke'; invitationId: string };

export interface InviteMetadata {
  inviter_name: string;
  workspace_name: string;
}

export interface InvitationsStore {
  isOwner(workspaceId: string, userId: string): Promise<boolean>;
  workspace(workspaceId: string): Promise<{ name: string; kind: 'personal' | 'team' } | null>;
  account(email: string): Promise<{ userId: string; confirmed: boolean } | null>;
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  saveInvitation(input: {
    workspaceId: string;
    email: string;
    role: Role;
    invitedBy: string;
    userId: string | null;
  }): Promise<'added' | 'pending'>;
  pendingInvitation(id: string): Promise<{ id: string; workspaceId: string; email: string } | null>;
  revoke(id: string): Promise<void>;
  countOtherPending(email: string, exceptId: string): Promise<number>;
  displayName(userId: string): Promise<string>;
}

export interface AuthAdmin {
  setMetadata(userId: string, data: InviteMetadata): Promise<void>;
  /** Throws on failures other than rate limiting. */
  invite(email: string, data: InviteMetadata): Promise<'sent' | 'rate_limited'>;
  deleteUser(userId: string): Promise<void>;
}

export interface Outcome {
  status: number;
  body: { status: 'added' | 'invited' | 'revoked' } | { message: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: readonly string[] = ['owner', 'editor', 'viewer'];

const fail = (status: number, message: string): Outcome => ({ status, body: { message } });

const SIGN_IN_AGAIN = fail(401, 'Please sign in again.');
const INVALID_BODY = fail(400, 'Check the email and role.');
const NOT_OWNER_INVITE = fail(403, 'Only workspace owners can invite people.');
const NOT_TEAM = fail(400, 'Invite people to a team workspace.');
const MAIL_FAILED = fail(502, "We couldn't send the invitation email.");
const RATE_LIMITED = fail(429, 'Too many attempts. Wait a minute and try again.');
const NOT_OWNER_REVOKE = fail(403, 'Only workspace owners can revoke invitations.');

/** The one form of an email used everywhere: trimmed and lowercased (Review Focus 4). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value);
}

export function parseRequest(body: unknown): InvitationRequest | null {
  if (!isRecord(body)) return null;
  if (body.action === 'invite') {
    const { workspaceId, email, role } = body;
    if (!isUuid(workspaceId) || typeof email !== 'string' || !isRole(role)) return null;
    const normalized = normalizeEmail(email);
    if (!EMAIL.test(normalized)) return null;
    return { action: 'invite', workspaceId, email: normalized, role };
  }
  if (body.action === 'revoke') {
    const { invitationId } = body;
    if (!isUuid(invitationId)) return null;
    return { action: 'revoke', invitationId };
  }
  return null;
}

export async function handleInvitations(
  callerId: string | null,
  body: unknown,
  deps: { store: InvitationsStore; admin: AuthAdmin },
): Promise<Outcome> {
  if (callerId === null) return SIGN_IN_AGAIN;
  const request = parseRequest(body);
  if (request === null) return INVALID_BODY;
  return request.action === 'invite'
    ? invite(callerId, request, deps)
    : revoke(callerId, request.invitationId, deps);
}

async function invite(
  callerId: string,
  request: Extract<InvitationRequest, { action: 'invite' }>,
  { store, admin }: { store: InvitationsStore; admin: AuthAdmin },
): Promise<Outcome> {
  const { workspaceId, email, role } = request;

  // An unknown workspace has no owners, so it fails here too.
  if (!(await store.isOwner(workspaceId, callerId))) return NOT_OWNER_INVITE;
  const workspace = await store.workspace(workspaceId);
  if (workspace === null) return NOT_OWNER_INVITE;
  if (workspace.kind !== 'team') return NOT_TEAM;

  const account = await store.account(email);
  if (account?.confirmed) {
    if (await store.isMember(workspaceId, account.userId)) {
      return fail(409, `${email} is already a member.`);
    }
    await store.saveInvitation({
      workspaceId,
      email,
      role,
      invitedBy: callerId,
      userId: account.userId,
    });
    return { status: 200, body: { status: 'added' } };
  }

  // No account, or one that was never confirmed: keep a pending invitation, then send the email.
  // The pending row stays when the email fails, so the owner can resend.
  await store.saveInvitation({ workspaceId, email, role, invitedBy: callerId, userId: null });
  const metadata: InviteMetadata = {
    inviter_name: await store.displayName(callerId),
    workspace_name: workspace.name,
  };
  try {
    if (account) await admin.setMetadata(account.userId, metadata);
    const sent = await admin.invite(email, metadata);
    if (sent === 'rate_limited') return RATE_LIMITED;
  } catch {
    return MAIL_FAILED;
  }
  return { status: 200, body: { status: 'invited' } };
}

async function revoke(
  callerId: string,
  invitationId: string,
  { store, admin }: { store: InvitationsStore; admin: AuthAdmin },
): Promise<Outcome> {
  // A missing or no-longer-pending invitation answers like a non-owner, so ids can't be probed.
  const invitation = await store.pendingInvitation(invitationId);
  if (invitation === null) return NOT_OWNER_REVOKE;
  if (!(await store.isOwner(invitation.workspaceId, callerId))) return NOT_OWNER_REVOKE;

  await store.revoke(invitation.id);

  // A never-activated account holds no data; delete it unless another invitation still waits (D13).
  const email = normalizeEmail(invitation.email);
  const account = await store.account(email);
  if (
    account &&
    !account.confirmed &&
    (await store.countOtherPending(email, invitation.id)) === 0
  ) {
    await admin.deleteUser(account.userId);
  }
  return { status: 200, body: { status: 'revoked' } };
}
