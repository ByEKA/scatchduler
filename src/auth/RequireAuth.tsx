import { Loader2 } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';

/** Full-screen spinner shown while the session is still being read. */
export function LoadingScreen(): ReactElement {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div role="status" aria-label="Loading">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}

/** Renders its children for signed-in users and sends everyone else to /sign-in. */
export function RequireAuth({ children }: { children: ReactNode }): ReactElement {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'signed-out') {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
