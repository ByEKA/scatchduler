import { createContext, useContext, useEffect, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectFormValues } from '@/features/projects/project-schema';
import { cn } from '@/lib/utils';

export interface WizardFieldsValue {
  /** Set while the wizard saves: fields keep their focus and values but can't change. */
  locked: boolean;
  /** Called after a field changed or a date field lost focus, so the wizard can check it again. */
  onFieldChange(name: keyof ProjectFormValues): void;
}

const WizardFieldsContext = createContext<WizardFieldsValue>({
  locked: false,
  onFieldChange: () => {},
});

/** Set by the wizard around the step on screen. */
export function WizardFieldsProvider({
  value,
  children,
}: {
  value: WizardFieldsValue;
  children: ReactNode;
}): ReactElement {
  return <WizardFieldsContext value={value}>{children}</WizardFieldsContext>;
}

export function useWizardFields(): WizardFieldsValue {
  return useContext(WizardFieldsContext);
}

/** Two fields side by side from 640 px, stacked below (spec §6.7). */
export function FieldRow({ children }: { children: ReactNode }): ReactElement {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/**
 * A field label. For a required field the `*` is a sibling of the label, hidden from assistive
 * tech, and the control carries `aria-required` (spec §6.7).
 */
export function FieldLabel({
  htmlFor,
  required = false,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-0.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold">
        {children}
      </Label>
      {required && (
        <span aria-hidden="true" className="text-xs font-semibold text-muted-foreground">
          *
        </span>
      )}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children: string }): ReactElement {
  return (
    <p id={id} className="text-xs text-destructive">
      {children}
    </p>
  );
}

type TextFieldName = Exclude<keyof ProjectFormValues, 'coverImage' | 'projectType'>;

/** A labelled text, email or date input bound to one form value, with its error under it. */
export function TextField({
  name,
  label,
  type = 'text',
  required = false,
}: {
  name: TextFieldName;
  label: string;
  type?: 'text' | 'email' | 'date';
  required?: boolean;
}): ReactElement {
  const {
    register,
    clearErrors,
    getFieldState,
    formState: { errors },
  } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const id = useId();
  const errorId = useId();
  const error = errors[name]?.message;
  // "Enter a valid date" for a partial entry describes this input, and the entry goes with it: the
  // input that replaces it when the step shows again is empty.
  useEffect(() => {
    if (type !== 'date') return;
    return () => {
      if (getFieldState(name).error?.type === 'badInput') clearErrors(name);
    };
  }, [type, name, getFieldState, clearErrors]);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <Input
        id={id}
        type={type}
        autoComplete="off"
        aria-required={required ? true : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        readOnly={locked}
        // The browser draws the date picker icon from the color scheme.
        className={cn(type === 'date' && 'dark:scheme-dark')}
        {...register(name, {
          onChange: () => onFieldChange(name),
          // Typing or clearing part of a date changes no value, so a date is checked on blur too.
          onBlur: type === 'date' ? () => onFieldChange(name) : undefined,
        })}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
