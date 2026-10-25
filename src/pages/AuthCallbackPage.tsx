import { Loader2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { safeNext } from '@/auth/safe-next';
import { RepositoryError } from '@/data/errors';
import { useOAuthCallback } from '@/hooks/useAuthActions';

/**
 * `/auth/callback`, where Google sends the visitor back (P2 spec §5.5). It finishes the sign-in
 * once, waits for the session, then opens `next` (only a path inside the app) or `/home`. A
 * failure goes back to `/sign-in` with a banner.
 */
export function AuthCallbackPage(): ReactElement {
  const location = useLocation();
  const { status } = useAuth();
  const href = `${window.location.origin}${location.pathname}${location.search}${location.hash}`;
  const callback = useOAuthCallback(href);

  if (callback.isError) {
    const { error } = callback;
    const authError =
      error instanceof RepositoryError && error.code === 'forbidden' ? 'no-access' : 'failed';
    return <Navigate to="/sign-in" replace state={{ authError }} />;
  }
  if (callback.isSuccess && status === 'signed-in') {
    const next = new URLSearchParams(location.search).get('next');
    return <Navigate to={safeNext(next)} replace />;
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        Signing you in…
      </div>
    </main>
  );
}
