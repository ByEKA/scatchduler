// The repository contract's fixture on the local stack (P2 spec §9): every call loads its own copy
// of the seed under fresh, tagged emails, so tests and files never share data and can run in
// parallel. The data stays until `npm run db:reset`.
import { createClient } from '@supabase/supabase-js';
import type { AppSupabaseClient } from '@/data/supabase/client';
import type { Database } from '@/data/supabase/database.types';
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository';
import type { MakeRepositoryFixture } from '@/test/contract/repository.contract';
import { readLocalStack } from './local-stack';
import { loadSeed } from './seed-loader';

const PASSWORD = 'letters12345';
const stack = readLocalStack();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(stack.apiUrl, stack.secretKey, clientOptions);

/** A client on the publishable key, signed in with the password. */
export async function signedInClient(email: string, password: string): Promise<AppSupabaseClient> {
  const client = createClient<Database>(stack.apiUrl, stack.publishableKey, clientOptions);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Signing in ${email} failed: ${error.message}`, { cause: error });
  return client;
}

/** A tag no other fixture uses; lowercase, because stored emails are. */
function freshTag(): string {
  return `k${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
}

export const makeSupabaseRepositoryFixture: MakeRepositoryFixture = async ({
  scenario = 'default',
  teamRole,
} = {}) => {
  const loaded = await loadSeed(admin, {
    scenario,
    now: new Date(),
    password: PASSWORD,
    teamRole,
    tag: freshTag(),
  });
  const client = await signedInClient(loaded.users.current.email, PASSWORD);
  return {
    repository: new SupabaseRepository(client),
    users: loaded.users,
    workspaces: loaded.workspaces,
    projectIds: loaded.projectIds,
    pendingInvitationEmail: loaded.pendingInvitationEmail,
    trialEndsAt: loaded.trialEndsAt,
  };
};
