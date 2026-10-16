import { defaultFilter } from 'cmdk';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import type { ReactElement, Ref } from 'react';
import { useLeaveForm } from '@/components/common/FormDialog';
import { OPTION_CLASSES, POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import type { ID } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { cn } from '@/lib/utils';

// Items carry the project id as their value, so two projects with the same name stay apart; the
// search matches the name and code that each item passes as keywords.
function matchKeywords(_value: string, search: string, keywords?: string[]): number {
  return defaultFilter(keywords?.join(' ') ?? '', search);
}

function CodeChip({ code }: { code: string }): ReactElement {
  return (
    <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs text-muted-foreground">
      {code}
    </span>
  );
}

export interface ProjectComboboxProps {
  /** The trigger's id, for the field's `<label htmlFor>`. */
  id: string;
  value: ID | null;
  onChange(id: ID): void;
  invalid?: boolean;
  /** Id of the field's error text. */
  describedBy?: string;
  disabled?: boolean;
  /** The trigger, so a form can focus the field when its value is invalid. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A searchable picker over the current workspace's projects (spec §6.7, D11). The trigger and the
 * options show the project's code and name.
 */
export function ProjectCombobox({
  id,
  value,
  onChange,
  invalid = false,
  describedBy,
  disabled = false,
  ref,
}: ProjectComboboxProps): ReactElement {
  const { projects } = useCurrentContext();
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const selected = projects.find((p) => p.id === value) ?? null;

  const select = (projectId: ID) => {
    setOpen(false);
    onChange(projectId);
  };

  return (
    // Modal, like a native select: while the list is open it keeps focus, and the dialog behind
    // it is hidden from assistive tech and ignores the pointer.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? contentId : undefined}
          aria-required="true"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none hover:bg-accent/40 disabled:pointer-events-none disabled:opacity-50',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring',
            'aria-invalid:border-destructive',
          )}
        >
          {selected ? (
            <>
              <CodeChip code={selected.code} />
              <span className="min-w-0 flex-1 truncate" title={selected.name}>
                {selected.name}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">Select project</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          id={contentId}
          side="bottom"
          align="start"
          sideOffset={6}
          aria-label="Projects"
          className={cn(
            POPOVER_SHELL_CLASSES,
            'w-(--radix-popover-trigger-width) origin-(--radix-popover-content-transform-origin)',
          )}
        >
          <Command label="Search projects" filter={matchKeywords} defaultValue={value ?? undefined}>
            <CommandInput placeholder="Search projects…" />
            <CommandList className="max-h-64 pt-1">
              <CommandEmpty>No projects found</CommandEmpty>
              {projects.map((project) => {
                const chosen = project.id === value;
                return (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    keywords={[project.name, project.code]}
                    aria-current={chosen ? 'true' : undefined}
                    onSelect={() => select(project.id)}
                    className={OPTION_CLASSES}
                  >
                    <CodeChip code={project.code} />
                    <span className="min-w-0 flex-1 truncate" title={project.name}>
                      {project.name}
                    </span>
                    <Check
                      aria-hidden="true"
                      className={cn('size-3.5 shrink-0 text-link', !chosen && 'invisible')}
                    />
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}

/**
 * The Project field of both schedule dialogs: label, picker, error and the "Create a new project"
 * link-button, which replaces the dialog with the new project wizard (spec §4.6, §6.7); on a
 * changed form it asks "Discard changes?" first.
 */
export function ProjectField({
  value,
  onChange,
  error,
  disabled = false,
  ref,
}: {
  value: ID | null;
  onChange(id: ID): void;
  error?: string;
  /**
   * Set while the dialog saves. The link would replace the dialog, so a failed save could not
   * keep the form (spec §6.10), and the picker would show a project the save is not going to.
   */
  disabled?: boolean;
  ref?: Ref<HTMLButtonElement>;
}): ReactElement {
  const { openDialog } = useDialogs();
  const leaveForm = useLeaveForm();
  const fieldId = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId} className="text-xs font-semibold">
        Project
      </Label>
      <ProjectCombobox
        ref={ref}
        id={fieldId}
        value={value}
        onChange={onChange}
        invalid={error !== undefined}
        describedBy={error !== undefined ? errorId : undefined}
        disabled={disabled}
      />
      {error !== undefined && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => leaveForm(() => openDialog('newProject'))}
        className="flex items-center gap-1 self-start rounded-sm text-xs font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Create a new project
      </button>
    </div>
  );
}
