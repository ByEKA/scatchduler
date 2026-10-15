import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import type { To } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen } from '@/auth/RequireAuth';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorMessage } from '@/lib/format';

const signInSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
});

/** The page RequireAuth turned the visitor away from (its `state.from`), else Home. */
function returnTo(state: unknown): To {
  const from: unknown =
    typeof state === 'object' && state !== null && 'from' in state ? state.from : null;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return '/home';
  const { pathname } = from;
  if (typeof pathname !== 'string' || pathname === '/sign-in') return '/home';
  const search = 'search' in from && typeof from.search === 'string' ? from.search : '';
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : '';
  return { pathname, search, hash };
}

export function SignInPage(): ReactElement {
  const { status, signInWithEmail } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const emailId = useId();
  const errorId = useId();
  const [linkSent, setLinkSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: '' } });

  const target = returnTo(location.state);
  // Same rule as createDataLayer: a missing or blank VITE_DATA_SOURCE means mock data.
  const demoMode = (import.meta.env.VITE_DATA_SOURCE?.trim() || 'mock') === 'mock';

  if (status === 'loading') return <LoadingScreen />;
  // While a sign-in is in flight the submit handler navigates, so the redirect waits for it.
  if (status === 'signed-in' && !isSubmitting) return <Navigate to={target} replace />;

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      const result = await signInWithEmail(email);
      if (result === 'link-sent') {
        setLinkSent(true);
      } else {
        void navigate(target, { replace: true });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  const emailError = errors.email?.message;

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[380px] rounded-xl bg-card p-8 text-card-foreground ring-1 ring-edge">
        <BrandLogo />
        <h1 className="mt-6 text-lg font-bold tracking-[-0.01em]">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your work email to continue.</p>
        {linkSent ? (
          <p role="status" className="mt-6 text-sm">
            Check your inbox for a sign-in link.
          </p>
        ) : (
          <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={emailId} className="text-xs font-semibold">
                Email
              </Label>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? errorId : undefined}
                {...register('email')}
              />
              {emailError && (
                <p id={errorId} className="text-xs text-destructive">
                  {emailError}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Continue
            </Button>
            {demoMode && (
              <p className="text-xs text-muted-foreground">
                Demo mode: any email signs you in as the demo user.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
