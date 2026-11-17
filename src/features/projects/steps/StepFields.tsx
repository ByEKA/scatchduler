import { Select as SelectPrimitive } from 'radix-ui';
import { createContext, useContext, useEffect, useId } from 'react';
import type { ClipboardEvent, ReactElement, ReactNode } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import {
  POPOVER_SHELL_CLASSES,
  SELECT_ITEM_HIGHLIGHT_CLASSES,
} from '@/components/common/popover-classes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectFormValues } from '@/features/projects/project-schema';
import { isOptionValue, type Option } from '@/lib/project-options';
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

/** A muted hint under a field or a row of fields; the controls it describes name its id. */
export function FieldHint({ id, children }: { id: string; children: ReactNode }): ReactElement {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}

/** The form values a `SelectField` holds. */
export type SelectFieldName = 'status' | 'stage' | 'projectType' | 'sector';

type TextFieldName = Exclude<keyof ProjectFormValues, 'coverImage' | SelectFieldName>;

/** A labelled text, email or date input bound to one form value, with its error under it. */
export function TextField({
  name,
  label,
  type = 'text',
  required = false,
  hintId,
  deps,
  onPaste,
}: {
  name: TextFieldName;
  label: string;
  type?: 'text' | 'email' | 'date';
  required?: boolean;
  /** The id of a `FieldHint` that describes this field, such as one under its row. */
  hintId?: string;
  /**
   * Fields whose errors depend on this one: once the form has been submitted, they're checked
   * again when this one changes.
   */
  deps?: TextFieldName[];
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void;
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
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(' ');
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
        aria-describedby={describedBy === '' ? undefined : describedBy}
        readOnly={locked}
        onPaste={onPaste}
        // The browser draws the date picker icon from the color scheme.
        className={cn(type === 'date' && 'dark:scheme-dark')}
        {...register(name, {
          onChange: () => onFieldChange(name),
          // Typing or clearing part of a date changes no value, so a date is checked on blur too.
          onBlur: type === 'date' ? () => onFieldChange(name) : undefined,
          deps,
        })}
      />
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

// Radix Select items can't have an empty value, so the "None" item stands for the form's ''.
const NONE_VALUE = '__none__';

/**
 * A labelled select bound to one form value. With `noneLabel` ("None"), a first item of that label
 * stands for no value, so an optional value can be cleared again (P1 spec §6.7, D13).
 */
export function SelectField<T extends string>({
  name,
  label,
  options,
  noneLabel,
}: {
  name: SelectFieldName;
  label: string;
  options: ReadonlyArray<Option<T>>;
  noneLabel?: string;
}): ReactElement {
  const { control } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const id = useId();
  const items: ReadonlyArray<Option<string>> =
    noneLabel === undefined ? options : [{ value: NONE_VALUE, label: noneLabel }, ...options];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value === '' ? NONE_VALUE : field.value}
            onValueChange={(value) => {
              if (value === NONE_VALUE && noneLabel !== undefined) field.onChange('');
              else if (isOptionValue(options, value)) field.onChange(value);
              else return;
              onFieldChange(name);
            }}
            disabled={locked}
          >
            <SelectTrigger ref={field.ref} id={id} onBlur={field.onBlur} className="w-full">
              <SelectValue />
            </SelectTrigger>
            {/* The Radix parts with the popover shell of spec §6.7; the generated SelectContent
                zooms from 95 % and slides in. */}
            <SelectPrimitive.Portal>
              <SelectPrimitive.Content
                position="popper"
                side="bottom"
                align="start"
                sideOffset={6}
                className={cn(
                  POPOVER_SHELL_CLASSES,
                  'max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-y-auto',
                )}
              >
                <SelectPrimitive.Viewport>
                  {items.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className={cn('h-8 py-0', SELECT_ITEM_HIGHLIGHT_CLASSES)}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectPrimitive.Viewport>
              </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
          </Select>
        )}
      />
    </div>
  );
}
