import { describe, expect, it, vi } from 'vitest';
import { handleInvitations, type AuthAdmin, type InvitationsStore } from './logic';

const WS = '11111111-1111-4111-8111-111111111111';
const INVITATION = '22222222-2222-4222-8222-222222222222';
const OWNER = 'owner-id';

function deps(store: Partial<InvitationsStore> = {}, admin: Partial<AuthAdmin> = {}) {
  return {
    store: {
      isOwner: vi.fn(async () => true),
      workspace: vi.fn(async () => ({ name: 'Site Operations', kind: 'team' as const })),
      account: vi.fn(async () => null),
      isMember: vi.fn(async () => false),
      saveInvitation: vi.fn(async (input: { userId: string | null }) =>
        input.userId ? ('added' as const) : ('pending' as const),
      ),
      pendingInvitation: vi.fn(async () => ({
        id: INVITATION,
        workspaceId: WS,
        email: 'pat@example.com',
      })),
      revoke: vi.fn(async () => {}),
      countOtherPending: vi.fn(async () => 0),
      displayName: vi.fn(async () => 'Deniz Kaya'),
      ...store,
    },
    admin: {
      setMetadata: vi.fn(async () => {}),
      invite: vi.fn(async () => 'sent' as const),
      deleteUser: vi.fn(async () => {}),
      ...admin,
    },
  };
}
const invite = (email = ' Pat@Example.com ', role = 'editor') => ({
  action: 'invite',
  workspaceId: WS,
  email,
  role,
});
const revoke = { action: 'revoke', invitationId: INVITATION };

describe('invitations logic', () => {
  it('needs a caller and a valid body', async () => {
    expect(await handleInvitations(null, invite(), deps())).toEqual({
      status: 401,
      body: { message: 'Please sign in again.' },
    });
    for (const body of [
      null,
      { ...invite(), workspaceId: 'nope' },
      invite('not an email'),
      invite('pat@example.com', 'admin'),
    ]) {
      expect(await handleInvitations(OWNER, body, deps())).toEqual({
        status: 400,
        body: { message: 'Check the email and role.' },
      });
    }
  });

  it('lets only owners invite, and only into team workspaces', async () => {
    expect(await handleInvitations(OWNER, invite(), deps({ isOwner: async () => false }))).toEqual({
      status: 403,
      body: { message: 'Only workspace owners can invite people.' },
    });
    expect(
      await handleInvitations(
        OWNER,
        invite(),
        deps({ workspace: async () => ({ name: 'My workspace', kind: 'personal' }) }),
      ),
    ).toEqual({ status: 400, body: { message: 'Invite people to a team workspace.' } });
  });

  it('refuses current members, however the email was typed', async () => {
    const d = deps({
      account: async () => ({ userId: 'u1', confirmed: true }),
      isMember: async () => true,
    });
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({
      status: 409,
      body: { message: 'pat@example.com is already a member.' },
    });
  });

  it('adds a confirmed account directly', async () => {
    const d = deps({ account: async () => ({ userId: 'u1', confirmed: true }) });
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({
      status: 200,
      body: { status: 'added' },
    });
    expect(d.store.saveInvitation).toHaveBeenCalledWith({
      workspaceId: WS,
      email: 'pat@example.com',
      role: 'editor',
      invitedBy: OWNER,
      userId: 'u1',
    });
    expect(d.admin.invite).not.toHaveBeenCalled();
  });

  it('invites a new email with the inviter and workspace names', async () => {
    const d = deps();
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({
      status: 200,
      body: { status: 'invited' },
    });
    expect(d.admin.invite).toHaveBeenCalledWith('pat@example.com', {
      inviter_name: 'Deniz Kaya',
      workspace_name: 'Site Operations',
    });
  });

  it('updates the metadata of an unconfirmed account before inviting it again', async () => {
    const d = deps({ account: async () => ({ userId: 'u2', confirmed: false }) });
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({
      status: 200,
      body: { status: 'invited' },
    });
    expect(d.admin.setMetadata).toHaveBeenCalledWith('u2', {
      inviter_name: 'Deniz Kaya',
      workspace_name: 'Site Operations',
    });
    expect(d.admin.invite).toHaveBeenCalled();
  });

  it('keeps the pending invitation when the email fails or is rate-limited', async () => {
    const failed = deps(
      {},
      {
        invite: async () => {
          throw new Error('smtp down');
        },
      },
    );
    expect(await handleInvitations(OWNER, invite(), failed)).toEqual({
      status: 502,
      body: { message: "We couldn't send the invitation email." },
    });
    expect(failed.store.saveInvitation).toHaveBeenCalled();
    expect(
      await handleInvitations(
        OWNER,
        invite(),
        deps({}, { invite: async () => 'rate_limited' as const }),
      ),
    ).toEqual({
      status: 429,
      body: { message: 'Too many attempts. Wait a minute and try again.' },
    });
  });

  it('revokes, deleting only a never-activated account without other invitations', async () => {
    const pending = deps({ account: async () => ({ userId: 'u3', confirmed: false }) });
    expect(await handleInvitations(OWNER, revoke, pending)).toEqual({
      status: 200,
      body: { status: 'revoked' },
    });
    expect(pending.store.revoke).toHaveBeenCalledWith(INVITATION);
    expect(pending.admin.deleteUser).toHaveBeenCalledWith('u3');
    const busy = deps({
      account: async () => ({ userId: 'u3', confirmed: false }),
      countOtherPending: async () => 1,
    });
    await handleInvitations(OWNER, revoke, busy);
    expect(busy.admin.deleteUser).not.toHaveBeenCalled();
    const active = deps({ account: async () => ({ userId: 'u4', confirmed: true }) });
    await handleInvitations(OWNER, revoke, active);
    expect(active.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('lets only owners revoke pending invitations', async () => {
    const forbidden = {
      status: 403,
      body: { message: 'Only workspace owners can revoke invitations.' },
    };
    expect(await handleInvitations(OWNER, revoke, deps({ isOwner: async () => false }))).toEqual(
      forbidden,
    );
    expect(
      await handleInvitations(OWNER, revoke, deps({ pendingInvitation: async () => null })),
    ).toEqual(forbidden);
  });
});
