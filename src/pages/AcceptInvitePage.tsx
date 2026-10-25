import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { authOptions } from '@/auth/auth-options';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { AuthCard, AuthField } from '@/features/auth/AuthCard';
import {
  newPasswordSchema,
  PASSWORD_HINT,
  personNameSchema,
} from '@/features/auth/password-schema';
import { isExpiredLinkError, useAcceptInvite } from '@/hooks/useAuthActions';
import { errorMessage } from '@/lib/format';

const acceptInviteSchema = z.intersection(personNameSchema, newPasswordSchema);

const TITLE = `Welcome to ${brand.name}`;

/**
 * `/accept-invite?token_hash=…` from the invite email (P2 spec §5.2, §5.5). Opening the page
 * never uses the token; submitting verifies it, sets the password and saves the name.
 */
export function AcceptInvitePage(): ReactElement {
  const [searchParams] = useSearchParams();
  const tokenHash = searchParams.get('token_hash');
  const navigate = useNavigate();
  const acceptInvite = useAcceptInvite();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { firstName: '', lastName: '', password: '', confirm: '' },
  });

  if (!tokenHash || isExpiredLinkError(acceptInvite.error)) {
    return (
      <AuthCard title={TITLE}>
        <p className="mt-6 text-sm">This link has expired or was already used.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the person who invited you to send a new invitation.
        </p>
        <p className="mt-6">
          <Link
            to="/sign-in"
            className="rounded-sm text-sm font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    );
  }

  const onSubmit = handleSubmit(({ firstName, lastName, password }) => {
    acceptInvite.mutate(
      { tokenHash, firstName, lastName, password },
      {
        onSuccess: () => {
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
    <AuthCard
      title={TITLE}
      description="Set your name and a password to finish setting up your account."
    >
      <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <AuthField
          label="First name"
          autoComplete="given-name"
          error={errors.firstName?.message}
          registration={register('firstName')}
        />
        <AuthField
          label="Last name"
          autoComplete="family-name"
          error={errors.lastName?.message}
          registration={register('lastName')}
        />
        <AuthField
          label="Password"
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
        <Button type="submit" className="w-full" disabled={acceptInvite.isPending}>
          {acceptInvite.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {acceptInvite.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      {authOptions().google && (
        <p className="mt-4 text-xs text-muted-foreground">
          Next time you can also continue with Google.
        </p>
      )}
    </AuthCard>
  );
}
