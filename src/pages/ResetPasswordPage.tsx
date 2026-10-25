import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthField } from '@/features/auth/AuthCard';
import { newPasswordSchema, PASSWORD_HINT } from '@/features/auth/password-schema';
import { isExpiredLinkError, useResetPassword } from '@/hooks/useAuthActions';
import { errorMessage } from '@/lib/format';

const TITLE = 'Choose a new password';

/**
 * `/reset-password?token_hash=…` from the recovery email (P2 spec §5.2, §5.5). Opening the page
 * never uses the token; submitting the form verifies it and saves the new password.
 */
export function ResetPasswordPage(): ReactElement {
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get('token_hash');
  const navigate = useNavigate();
  const resetPassword = useResetPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  if (!tokenHash || isExpiredLinkError(resetPassword.error)) {
    return (
      <AuthCard title={TITLE}>
        <p className="mt-6 text-sm">This link has expired or was already used.</p>
        <p className="mt-6">
          <Link
            to="/forgot-password"
            className="rounded-sm text-sm font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Request a new link
          </Link>
        </p>
      </AuthCard>
    );
  }

  const onSubmit = handleSubmit(({ password }) => {
    resetPassword.mutate(
      { tokenHash, password },
      {
        onSuccess: () => {
          toast.success('Password updated');
          void navigate('/home', { replace: true });
        },
        onError: (error) => {
          // An expired link replaces the form with the expired card instead.
          if (!isExpiredLinkError(error)) toast.error(errorMessage(error));
        },
      },
    );
  });

  return (
    <AuthCard title={TITLE}>
      <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <AuthField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          registration={register('password')}
        />
        <AuthField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          registration={register('confirm')}
        />
        <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
          {resetPassword.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {resetPassword.isPending ? 'Saving…' : 'Save password'}
        </Button>
      </form>
    </AuthCard>
  );
}
