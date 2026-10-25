import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation } from 'react-router';
import type { To } from 'react-router';
import { z } from 'zod';
import { authOptions } from '@/auth/auth-options';
import { useAuth } from '@/auth/AuthProvider';
import { LoadingScreen } from '@/auth/RequireAuth';
import { GoogleMark } from '@/components/common/GoogleMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RepositoryError } from '@/data/errors';
import { AuthCard } from '@/features/auth/AuthCard';
import { useSignInWithGoogle, useSignInWithPassword } from '@/hooks/useAuthActions';
import { errorMessage } from '@/lib/format';

const signInSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password'),
});

/** Banners for `location.state.authError`, set by `/auth/callback` (P2 spec §5.5). */
const AUTH_ERROR_BANNERS = {
  'no-access': 'This Google account has no access yet. Ask a workspace owner to invite you.',
  failed: "Google sign-in didn't work. Please try again.",
} as const;

/** The page RequireAuth turned the visitor away from (its `state.from`), or `null`. */
function requestedPage(state: unknown): { pathname: string; search: string; hash: string } | null {
  const from: unknown =
    typeof state === 'object' && state !== null && 'from' in state ? state.from : null;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return null;
  const { pathname } = from;
  if (typeof pathname !== 'string' || pathname === '/sign-in') return null;
  const search = 'search' in from && typeof from.search === 'string' ? from.search : '';
  const hash = 'hash' in from && typeof from.hash === 'string' ? from.hash : '';
  return { pathname, search, hash };
}

function authErrorBanner(state: unknown): string | null {
  const authError: unknown =
    typeof state === 'object' && state !== null && 'authError' in state ? state.authError : null;
  return authError === 'no-access' || authError === 'failed' ? AUTH_ERROR_BANNERS[authError] : null;
}

/** Wrong credentials show the service's own message; anything else the generic copy. */
function signInErrorMessage(error: unknown): string {
  return error instanceof RepositoryError && error.code === 'unauthorized'
    ? error.message
    : errorMessage(error);
}

export function SignInPage(): ReactElement {
  const { status } = useAuth();
  const location = useLocation();
  const emailId = useId();
  const emailErrorId = useId();
  const passwordId = useId();
  const passwordErrorId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const signInWithPassword = useSignInWithPassword();
  const signInWithGoogle = useSignInWithGoogle();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const { demo, google } = authOptions();
  const requested = requestedPage(location.state);
  const banner = authErrorBanner(location.state);

  if (status === 'loading') return <LoadingScreen />;
  // Signing in moves the status to signed-in, which brings the visitor to the requested page.
  if (status === 'signed-in') {
    const target: To = requested ?? '/home';
    return <Navigate to={target} replace />;
  }

  const pending = signInWithPassword.isPending || signInWithGoogle.isPending;
  const failure = signInWithPassword.error ?? signInWithGoogle.error;

  const onSubmit = handleSubmit(({ email, password }) => {
    signInWithGoogle.reset();
    signInWithPassword.mutate({ email, password });
  });

  const continueWithGoogle = () => {
    signInWithPassword.reset();
    const next = requested ? `${requested.pathname}${requested.search}${requested.hash}` : null;
    signInWithGoogle.mutate(next);
  };

  const emailError = errors.email?.message;
  const passwordError = errors.password?.message;

  return (
    <AuthCard
      title="Sign in"
      description="Sign in with your work email."
      banner={
        banner && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            {banner}
          </p>
        )
      }
    >
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
            aria-describedby={emailError ? emailErrorId : undefined}
            {...register('email')}
          />
          {emailError && (
            <p id={emailErrorId} className="text-xs text-destructive">
              {emailError}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={passwordId} className="text-xs font-semibold">
              Password
            </Label>
            <Link
              to="/forgot-password"
              className="rounded-sm text-xs font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-10"
              aria-invalid={passwordError ? true : undefined}
              aria-describedby={passwordError ? passwordErrorId : undefined}
              {...register('password')}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
          {passwordError && (
            <p id={passwordErrorId} className="text-xs text-destructive">
              {passwordError}
            </p>
          )}
        </div>
        {failure !== null && (
          <p role="alert" className="text-sm text-destructive">
            {signInErrorMessage(failure)}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {signInWithPassword.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {signInWithPassword.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      {google && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            or
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={continueWithGoogle}
          >
            {signInWithGoogle.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <GoogleMark />
            )}
            Continue with Google
          </Button>
        </>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        {demo
          ? 'Demo mode: any email and password sign you in.'
          : 'Access is by invitation. Ask a workspace owner to invite you.'}
      </p>
    </AuthCard>
  );
}
