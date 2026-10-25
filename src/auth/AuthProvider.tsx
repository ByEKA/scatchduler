import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { toast } from 'sonner';
import type { Session } from '@/data/auth';
import { useAuthService } from '@/data/DataLayerProvider';
import { RepositoryError } from '@/data/errors';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  /** Ends the session; the auth state listener then clears the cache (P2 spec §5.4). */
  signOut(): Promise<void>;
}

interface AuthState {
  status: AuthStatus;
  session: Session | null;
}

const SESSION_EXPIRED = 'Your session expired. Please sign in again.';

const AuthContext = createContext<AuthContextValue | null>(null);

function stateFor(session: Session | null): AuthState {
  return session ? { status: 'signed-in', session } : { status: 'signed-out', session: null };
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof RepositoryError && error.code === 'unauthorized';
}

/**
 * Reads the session once, then follows the auth service's change events (P2 spec §5.4). When the
 * signed-in user goes away or changes, every cached query except the `['auth', …]` keys is
 * removed. While signed in, the first `unauthorized` error from any query or mutation signs out
 * with one "session expired" toast.
 */
export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const auth = useAuthService();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null });
  // Kept in refs so the cache subscriptions and the auth listener read the latest values.
  const statusRef = useRef<AuthStatus>('loading');
  const lastUserIdRef = useRef<string | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    let active = true;
    // A change event is newer than the first read, so the read is dropped once an event arrived.
    let changed = false;
    const apply = (session: Session | null) => {
      const userId = session?.userId ?? null;
      const previous = lastUserIdRef.current;
      if (previous !== null && previous !== userId) {
        // The user signed out or another account signed in: nothing of theirs may stay cached.
        // Mutations are left alone, and so are the auth keys (the /auth/callback query).
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      }
      if (userId !== null) expiredRef.current = false;
      lastUserIdRef.current = userId;
      const next = stateFor(session);
      statusRef.current = next.status;
      setState(next);
    };
    const unsubscribe = auth.onAuthStateChange((session) => {
      changed = true;
      apply(session);
    });
    auth.getSession().then(
      (session) => {
        if (active && !changed) apply(session);
      },
      (error: unknown) => {
        console.error('AuthProvider: could not read the session', error);
        if (active && !changed) apply(null);
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth, queryClient]);

  useEffect(() => {
    const onError = (error: unknown) => {
      if (!isUnauthorized(error) || statusRef.current !== 'signed-in' || expiredRef.current) {
        return;
      }
      expiredRef.current = true;
      toast.error(SESSION_EXPIRED, { id: 'session-expired' });
      void auth.signOut().catch((signOutError: unknown) => {
        console.error('AuthProvider: could not sign out after the session expired', signOutError);
      });
    };
    const offQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const offMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      offQueries();
      offMutations();
    };
  }, [auth, queryClient]);

  const signOut = useCallback(() => auth.signOut(), [auth]);

  const value = useMemo(
    () => ({ status: state.status, session: state.session, signOut }),
    [state, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
