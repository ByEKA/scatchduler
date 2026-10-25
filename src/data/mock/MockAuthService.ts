import type { AuthService, EmailLinkType, Session } from '@/data/auth';
import { RepositoryError } from '@/data/errors';
import { withLatency, type LatencyOptions } from '@/data/mock/latency';
import type { MockStore } from '@/data/mock/store';

type AuthListener = (session: Session | null) => void;

export interface MockAuthServiceOptions {
  store: MockStore;
  /** Delay before every call; `0` by default. */
  latencyMs?: number;
}

/** The password that fails like bad credentials (P2 spec §5.3). */
const WRONG_PASSWORD = 'wrong-password';
/** The email-link token that is always expired (P2 spec §5.3). */
const EXPIRED_TOKEN = 'expired';
const LINK_EXPIRED = 'This link has expired or was already used.';
const SESSION_EXPIRED = 'Your session expired. Please sign in again.';

/**
 * `AuthService` v2 over the mock store (P2 spec §5.3). The session lives in `db.session`, so it
 * survives a reload the same way the rest of the mock data does. Every sign-in signs in the seed
 * user.
 */
export class MockAuthService implements AuthService {
  private readonly store: MockStore;
  private readonly latencyMs: number;
  private readonly listeners = new Set<AuthListener>();
  /** Email-link tokens already accepted; kept in memory only. */
  private readonly usedTokens = new Set<string>();

  constructor(options: MockAuthServiceOptions) {
    this.store = options.store;
    this.latencyMs = options.latencyMs ?? 0;
  }

  getSession(): Promise<Session | null> {
    return this.run('read', () => this.store.read().session);
  }

  signInWithPassword(email: string, password: string): Promise<void> {
    // Demo mode: any email with a non-empty password signs in the seed user.
    void email;
    return this.run('write', () => {
      if (password === '' || password === WRONG_PASSWORD) {
        throw new RepositoryError('unauthorized', 'Wrong email or password');
      }
      this.signInSeedUser();
    });
  }

  signInWithGoogle(next: string | null): Promise<void> {
    // The mock never leaves the app, so there is nothing to return to.
    void next;
    return this.run('write', () => this.signInSeedUser());
  }

  completeOAuthSignIn(url: string): Promise<void> {
    void url;
    return this.run('write', () => undefined);
  }

  requestPasswordReset(email: string): Promise<void> {
    void email;
    return this.run('write', () => undefined);
  }

  verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<void> {
    void type;
    return this.run('write', () => {
      if (tokenHash === EXPIRED_TOKEN || this.usedTokens.has(tokenHash)) {
        throw new RepositoryError('validation', LINK_EXPIRED);
      }
      this.usedTokens.add(tokenHash);
      this.signInSeedUser();
    });
  }

  updatePassword(newPassword: string): Promise<void> {
    void newPassword;
    return this.run('write', () => {
      if (this.store.read().session === null) {
        throw new RepositoryError('unauthorized', SESSION_EXPIRED);
      }
    });
  }

  signOut(): Promise<void> {
    return this.run('write', () => {
      this.store.write((draft) => {
        draft.session = null;
      });
      this.notify(null);
    });
  }

  onAuthStateChange(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private signInSeedUser(): void {
    const db = this.store.write((draft) => {
      draft.session = { userId: draft.currentUserId };
    });
    this.notify(db.session);
  }

  /** Auth calls wait like repository calls but never fail at random. */
  private run<T>(kind: LatencyOptions['kind'], op: () => T): Promise<T> {
    return withLatency(op, { latencyMs: this.latencyMs, failRate: 0, kind });
  }

  private notify(session: Session | null): void {
    for (const listener of [...this.listeners]) {
      // The session has already changed, so one failing listener does not stop the others or
      // reject the sign-in / sign-out call.
      try {
        listener(session);
      } catch (error) {
        console.error('MockAuthService: auth state listener failed', error);
      }
    }
  }
}
