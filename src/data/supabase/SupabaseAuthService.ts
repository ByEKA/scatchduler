// `AuthService` v2 over Supabase Auth (P2 spec §5.3). Errors become `RepositoryError`s through the
// shared mapping in `errors.ts` (P2 spec §8.4); only the OAuth callback and the email-link paths
// add copy of their own.
import type { AuthService, EmailLinkType, Session } from '@/data/auth';
import { RepositoryError } from '@/data/errors';
import type { AppSupabaseClient } from '@/data/supabase/client';
import { toRepositoryError } from '@/data/supabase/errors';

type AuthListener = (session: Session | null) => void;

export interface SupabaseAuthServiceOptions {
  /** The app's origin, used to build the OAuth redirect (`window.location.origin` in the app). */
  origin: () => string;
}

const NO_ACCESS = 'This Google account has no access yet. Ask a workspace owner to invite you.';
const GOOGLE_FAILED = "Google sign-in didn't work. Please try again.";
const LINK_EXPIRED = 'This link has expired or was already used.';
const SIGNUPS_NOT_ALLOWED = /sign ?ups? not allowed/i;

function failure(code: RepositoryError['code'], message: string, cause?: unknown): RepositoryError {
  const error = new RepositoryError(code, message);
  if (cause !== undefined) error.cause = cause;
  return error;
}

/** `error`, `error_code` and `error_description` from the query, or else from the hash. */
function callbackParams(url: URL): {
  code: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
} {
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const read = (name: string) => query.get(name) ?? hash.get(name);
  return {
    code: query.get('code'),
    error: read('error'),
    errorCode: read('error_code'),
    errorDescription: read('error_description'),
  };
}

export class SupabaseAuthService implements AuthService {
  private readonly client: AppSupabaseClient;
  private readonly origin: () => string;

  constructor(client: AppSupabaseClient, options: SupabaseAuthServiceOptions) {
    this.client = client;
    this.origin = options.origin;
  }

  async getSession(): Promise<Session | null> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw toRepositoryError(error);
    return data.session ? { userId: data.session.user.id } : null;
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw toRepositoryError(error);
  }

  async signInWithGoogle(next: string | null): Promise<void> {
    const callback = `${this.origin()}/auth/callback`;
    const redirectTo = next ? `${callback}?next=${encodeURIComponent(next)}` : callback;
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw toRepositoryError(error);
  }

  async completeOAuthSignIn(url: string): Promise<void> {
    let params: ReturnType<typeof callbackParams>;
    try {
      params = callbackParams(new URL(url));
    } catch (cause) {
      throw failure('unauthorized', GOOGLE_FAILED, cause);
    }
    const { code, error, errorCode, errorDescription } = params;
    if (error !== null || errorCode !== null || errorDescription !== null) {
      const refused =
        errorCode === 'signup_disabled' ||
        (errorDescription !== null && SIGNUPS_NOT_ALLOWED.test(errorDescription));
      throw refused ? failure('forbidden', NO_ACCESS) : failure('unauthorized', GOOGLE_FAILED);
    }
    if (code === null || code === '') throw failure('unauthorized', GOOGLE_FAILED);
    const { error: exchangeError } = await this.client.auth.exchangeCodeForSession(code);
    if (exchangeError) throw failure('unauthorized', GOOGLE_FAILED, exchangeError);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email);
    if (!error) return;
    // No account enumeration: only rate limits and connection problems are reported.
    const mapped = toRepositoryError(error);
    if (mapped.code === 'rate_limited' || mapped.code === 'network') throw mapped;
  }

  async verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return;
    const mapped = toRepositoryError(error);
    if (mapped.code === 'network') throw mapped;
    throw failure('validation', LINK_EXPIRED, error);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw toRepositoryError(error);
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw toRepositoryError(error);
  }

  onAuthStateChange(listener: AuthListener): () => void {
    // supabase-js holds its auth lock while this callback runs, so it only forwards the user id
    // and never calls back into Supabase (P2 spec §5.3).
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      listener(event === 'SIGNED_OUT' || !session ? null : { userId: session.user.id });
    });
    return () => data.subscription.unsubscribe();
  }
}
