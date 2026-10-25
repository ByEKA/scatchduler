import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthField } from '@/features/auth/AuthCard';
import { useRequestPasswordReset } from '@/hooks/useAuthActions';
import { errorMessage } from '@/lib/format';

const forgotPasswordSchema = z.object({
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
});

const LINK_CLASS =
  'rounded-sm text-sm font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * `/forgot-password` (P2 spec §5.5). The confirmation never says whether the account exists:
 * the auth service resolves either way.
 */
export function ForgotPasswordPage(): ReactElement {
  const requestReset = useRequestPasswordReset();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(({ email }) => {
    requestReset.mutate(email, {
      onError: (error) => {
        toast.error(errorMessage(error));
      },
    });
  });

  const backToSignIn = (
    <Link to="/sign-in" className={LINK_CLASS}>
      Back to sign in
    </Link>
  );

  if (requestReset.isSuccess) {
    return (
      <AuthCard title="Reset your password">
        <p className="mt-6 text-sm">
          If an account exists for {requestReset.variables}, a reset link is on its way.
        </p>
        <p className="mt-6">{backToSignIn}</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new password."
    >
      <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <AuthField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          registration={register('email')}
        />
        <Button type="submit" className="w-full" disabled={requestReset.isPending}>
          {requestReset.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {requestReset.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <p className="mt-6">{backToSignIn}</p>
    </AuthCard>
  );
}
