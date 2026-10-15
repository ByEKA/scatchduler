import type { AuthService, Session } from '@/data/auth';
import { withLatency, type LatencyOptions } from '@/data/mock/latency';
import type { MockStore } from '@/data/mock/store';

type AuthListener = (session: Session | null) => void;
type SignInResult = Awaited<ReturnType<AuthService['signInWithEmail']>>;

export interface MockAuthServiceOptions {
  store: MockStore;
  /** Delay before every call; `0` by default. */
  latencyMs?: number;
}

/**
 * `AuthService` over the mock store. The session lives in `db.session`, so it survives a reload
 * the same way the rest of the mock data does.
 */
export class MockAuthService implements AuthService {
  private readonly store: MockStore;
  private readonly latencyMs: number;
  private readonly listeners = new Set<AuthListener>();

  constructor(options: MockAuthServiceOptions) {
    this.store = options.store;
    this.latencyMs = options.latencyMs ?? 0;
  }

  getSession(): Promise<Session | null> {
    return this.run('read', () => this.store.read().session);
  }

  signInWithEmail(email: string): Promise<SignInResult> {
    // Demo mode: every address signs in the seed user.
    void email;
    return this.run('write', (): SignInResult => {
      const db = this.store.write((draft) => {
        draft.session = { userId: draft.currentUserId };
      });
      this.notify(db.session);
      return { status: 'signed-in' };
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
