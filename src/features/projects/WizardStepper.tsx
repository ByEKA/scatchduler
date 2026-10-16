import { Check } from 'lucide-react';
import type { ReactElement } from 'react';
import { WIZARD_STEPS } from '@/features/projects/project-schema';
import { cn } from '@/lib/utils';

export interface WizardStepperProps {
  /** Index of the step on screen. */
  current: number;
  /** How many steps have passed "Next": steps before this index are completed and clickable. */
  completed: number;
  onSelect(index: number): void;
  /** Set while the wizard saves: completed steps stop being clickable. */
  disabled?: boolean;
}

/**
 * The wizard's step markers and labels (spec §6.7), with a visually hidden live region that
 * announces the step on screen. Below 640 px the labels are visually hidden (spec §6.9).
 */
export function WizardStepper({
  current,
  completed,
  onSelect,
  disabled = false,
}: WizardStepperProps): ReactElement {
  const currentStep = WIZARD_STEPS[current] ?? WIZARD_STEPS[0];
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-2">
        {WIZARD_STEPS.map((step, index) => {
          const state =
            index === current ? 'current' : index < completed ? 'completed' : 'upcoming';
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                  state === 'current' && 'bg-primary text-primary-foreground',
                  state === 'completed' && 'bg-brand-600/20 text-link',
                  state === 'upcoming' && 'border border-input text-muted-foreground',
                )}
              >
                {state === 'completed' ? <Check className="size-3" /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-xs font-medium max-sm:sr-only',
                  state === 'current' ? 'text-foreground' : 'text-muted-foreground',
                  state === 'completed' && 'group-hover:text-foreground',
                )}
              >
                {step.label}
              </span>
              {/* The check marker is decorative, so the state is in the button's name (D13). */}
              {state === 'completed' && <span className="sr-only">, completed</span>}
            </>
          );
          return (
            <li key={step.id} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-border" />}
              {state === 'completed' ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(index)}
                  className="group flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {content}
                </button>
              ) : (
                <span
                  aria-current={state === 'current' ? 'step' : undefined}
                  className="flex items-center gap-2"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {`Step ${current + 1} of ${WIZARD_STEPS.length}: ${currentStep.label}`}
      </p>
    </div>
  );
}
