import {
  runRepositoryContract,
  type ContractUser,
  type MakeRepositoryFixture,
} from '@/test/contract/repository.contract';
import { createTestDataLayer } from '@/test/fakes';

/** A fixture over a new in-memory mock store; the seed's users are found by their emails. */
const makeMockFixture: MakeRepositoryFixture = async ({ scenario = 'default', teamRole } = {}) => {
  const { repository, store } = createTestDataLayer({ scenario, teamRole });
  const db = store.read();
  const user = (email: string): ContractUser | null => {
    const found = db.users.find((u) => u.email === email);
    return found
      ? { id: found.id, email: found.email, firstName: found.firstName, lastName: found.lastName }
      : null;
  };

  const current = user('deniz.kaya@example.com');
  const personal = db.workspaces.find((w) => w.kind === 'personal');
  const { trialEndsAt } = db.subscription;
  if (current === null || personal === undefined || trialEndsAt === null) {
    throw new Error('The mock seed has no current user, personal workspace or trial end');
  }

  return {
    repository,
    users: {
      current,
      mert: user('mert.demir@example.com'),
      elif: user('elif.arslan@example.com'),
    },
    workspaces: {
      personal: personal.id,
      team: db.workspaces.find((w) => w.kind === 'team')?.id ?? null,
    },
    projectIds: Object.fromEntries(db.projects.map((p) => [p.code, p.id])),
    pendingInvitationEmail:
      db.invitations.find((i) => i.acceptedAt === null && i.revokedAt === null)?.email ?? null,
    trialEndsAt,
  };
};

runRepositoryContract('mock', makeMockFixture);
