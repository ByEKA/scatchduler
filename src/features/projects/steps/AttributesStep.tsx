import { Select as SelectPrimitive } from 'radix-ui';
import { useId } from 'react';
import type { ReactElement } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProjectType } from '@/data/types';
import { PROJECT_TYPE_OPTIONS, type ProjectFormValues } from '@/features/projects/project-schema';
import {
  FieldLabel,
  FieldRow,
  TextField,
  useWizardFields,
} from '@/features/projects/steps/StepFields';
import { cn } from '@/lib/utils';

// Radix Select items can't have an empty value, so "None" stands for the form's ''.
const NO_TYPE = 'none';

function isProjectType(value: string): value is ProjectType {
  return PROJECT_TYPE_OPTIONS.some((option) => option.value === value);
}

function ProjectTypeField(): ReactElement {
  const { control } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id}>Project type</FieldLabel>
      <Controller
        control={control}
        name="projectType"
        render={({ field }) => (
          <Select
            value={field.value === '' ? NO_TYPE : field.value}
            onValueChange={(value) => {
              if (value === NO_TYPE) field.onChange('');
              else if (isProjectType(value)) field.onChange(value);
              else return;
              onFieldChange('projectType');
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
                  {/* "None" first, so the optional type can be cleared again (spec §6.7, D13). */}
                  {[{ value: NO_TYPE, label: 'None' }, ...PROJECT_TYPE_OPTIONS].map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      // The accent background alone is about 1.1 : 1 against the popover, so the
                      // highlighted option also gets the ring-colored outline (spec §6.12).
                      className="h-8 py-0 focus:outline-2 focus:-outline-offset-2 focus:outline-ring focus:outline-solid"
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

/** Step 2: project type and the three dates, as native date inputs (spec §6.7, D7). */
export function AttributesStep(): ReactElement {
  return (
    <>
      <FieldRow>
        <ProjectTypeField />
        <TextField name="statusDate" label="Status date" type="date" />
      </FieldRow>
      <FieldRow>
        <TextField name="startDate" label="Start date" type="date" />
        <TextField name="plannedFinishDate" label="Planned finish date" type="date" />
      </FieldRow>
    </>
  );
}
