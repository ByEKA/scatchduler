import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { Session } from '@/data/auth';
import { useAuthService } from '@/data/DataLayerProvider';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  signInWithEmail(email: string): Promise<'signed-in' | 'link-sent'>;
  /** Signs out, then clears the query cache so the next user never sees this user's data. */
  signOut(): Promise<void>;
}

interface AuthState {
  status: AuthStatus;
  session: Session | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function stateFor(session: Session | null): AuthState {
  return session ? { status: 'signed-in', session } : { status: 'signed-out', session: null };
}

/** Reads the session once, then follows the auth service's change events (spec §5.3). */
export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const auth = useAuthService();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null });

  useEffect(() => {
    let active = true;
    // A change event is newer than the first read, so the read is dropped once an event arrived.
    let changed = false;
    const unsubscribe = auth.onAuthStateChange((session) => {
      changed = true;
      setState(stateFor(session));
    });
    auth.getSession().then(
      (session) => {
        if (active && !changed) setState(stateFor(session));
      },
      (error: unknown) => {
        console.error('AuthProvider: could not read the session', error);
        if (active && !changed) setState(stateFor(null));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  const signInWithEmail = useCallback(
    async (email: string) => {
      const result = await auth.signInWithEmail(email);
      return result.status;
    },
    [auth],
  );

  const signOut = useCallback(async () => {
    await auth.signOut();
    queryClient.clear();
  }, [auth, queryClient]);

  const value = useMemo(
    () => ({ status: state.status, session: state.session, signInWithEmail, signOut }),
    [state, signInWithEmail, signOut],
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
