import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface AuthCardProps {
  title: string;
  description?: string;
  /** Shown at the top of the card, above the title (the sign-in page's callback banner). */
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * The Phase 1 sign-in card (P2 spec §5.5): centered, 380 px wide, `BrandLogo` on top. Every auth
 * screen uses it. Children follow the title and description and carry their own top margin.
 */
export function AuthCard({ title, description, banner, children }: AuthCardProps): ReactElement {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-[380px] rounded-xl bg-card p-8 text-card-foreground ring-1 ring-edge">
        <BrandLogo />
        {banner}
        <h1 className="mt-6 text-lg font-bold tracking-[-0.01em]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
    </main>
  );
}

export interface AuthFieldProps {
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  /** The field's validation message, if any. */
  error?: string;
  /** Help text under the field, linked through `aria-describedby`. */
  hint?: string;
  registration: UseFormRegisterReturn;
}

/** A labelled input of an auth form, with its hint and validation message. */
export function AuthField({
  label,
  type = 'text',
  autoComplete,
  error,
  hint,
  registration,
}: AuthFieldProps): ReactElement {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId} className="text-xs font-semibold">
        {label}
      </Label>
      <Input
        id={inputId}
        type={type}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...registration}
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
