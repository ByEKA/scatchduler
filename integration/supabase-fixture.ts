// The contract fixtures on the local stack (P2 spec §9). The repository fixture loads its own copy
// of the seed under fresh, tagged emails on every call, and the auth fixture creates its own
// account, so tests and files never share data and can run in parallel. The data stays until
// `npm run db:reset`.
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient, type AppSupabaseClient } from '@/data/supabase/client';
import type { Database } from '@/data/supabase/database.types';
import { SupabaseAuthService } from '@/data/supabase/SupabaseAuthService';
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository';
import type { AuthFixture } from '@/test/contract/auth.contract';
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

/**
 * The auth contract's fixture: a fresh confirmed account and a signed-in `SupabaseAuthService` on
 * the app's own client (memory session storage), so the contract runs the code the app runs.
 */
export const makeSupabaseAuthFixture = async (): Promise<AuthFixture> => {
  const email = `auth.${freshTag()}@example.com`;
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Auth', last_name: 'Contract' },
  });
  if (createError)
    throw new Error(`Creating ${email} failed: ${createError.message}`, { cause: createError });

  const client = createSupabaseClient({
    url: stack.apiUrl,
    publishableKey: stack.publishableKey,
    storage: null,
  });
  const auth = new SupabaseAuthService(client, { origin: () => 'http://localhost:5173' });
  await auth.signInWithPassword(email, PASSWORD);

  return {
    auth,
    email,
    password: PASSWORD,
    badPassword: 'wrong-password-1',
    freshToken: async () => {
      const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
      if (error)
        throw new Error(`Generating a link for ${email} failed: ${error.message}`, {
          cause: error,
        });
      return data.properties.hashed_token;
    },
  };
};
