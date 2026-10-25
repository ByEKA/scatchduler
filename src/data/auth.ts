import type { ID } from './types';

export interface Session {
  userId: ID;
}

export type EmailLinkType = 'invite' | 'recovery';

export interface AuthService {
  getSession(): Promise<Session | null>;
  /** Rejects RepositoryError('unauthorized', 'Wrong email or password') for bad credentials. */
  signInWithPassword(email: string, password: string): Promise<void>;
  /** Supabase: leaves the app for Google and returns to /auth/callback (?next=<path> when given). Mock: signs in immediately. */
  signInWithGoogle(next: string | null): Promise<void>;
  /** Supabase: finishes the Google redirect described by `url`. Mock: resolves. See §5.5 for the error copy. */
  completeOAuthSignIn(url: string): Promise<void>;
  /** Resolves whether or not the account exists (no account enumeration); rejects only with 'network' or 'rate_limited'. */
  requestPasswordReset(email: string): Promise<void>;
  /** Exchanges an email link's one-time token for a session. Rejects RepositoryError('validation', 'This link has expired or was already used.'). */
  verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<void>;
  /** Needs a session. */
  updatePassword(newPassword: string): Promise<void>;
  /** Ends the session on this device only. */
  signOut(): Promise<void>;
  /** Unchanged from Phase 1. Returns an unsubscribe function. */
  onAuthStateChange(listener: (session: Session | null) => void): () => void;
}
