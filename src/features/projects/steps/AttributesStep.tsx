import { useId } from 'react';
import type { ReactElement } from 'react';
import { FieldHint, FieldRow, SelectField, TextField } from '@/features/projects/steps/StepFields';
import {
  PROJECT_TYPE_OPTIONS,
  SECTOR_OPTIONS,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
} from '@/lib/project-options';

/**
 * Step 2: status, stage, project type, sector and the three dates, as native date inputs (P3 core
 * spec §6.4; P1 spec §6.7, D7). Status always has a value; the other selects start with "None".
 * With `currentScheduleName` (an edited project with a current schedule), the status date follows
 * that schedule, so its field is disabled and says so (R6).
 */
export function AttributesStep({
  currentScheduleName = null,
}: {
  currentScheduleName?: string | null;
}): ReactElement {
  const statusDateHintId = useId();
  const followsSchedule = currentScheduleName !== null;
  return (
    <>
      <FieldRow>
        <SelectField name="status" label="Status" options={STATUS_OPTIONS} />
        <SelectField name="stage" label="Stage" options={STAGE_OPTIONS} noneLabel="None" />
      </FieldRow>
      <FieldRow>
        <SelectField
          name="projectType"
          label="Project type"
          options={PROJECT_TYPE_OPTIONS}
          noneLabel="None"
        />
        <SelectField name="sector" label="Sector" options={SECTOR_OPTIONS} noneLabel="None" />
      </FieldRow>
      <FieldRow>
        <div className="flex min-w-0 flex-col gap-1.5">
          <TextField
            name="statusDate"
            label="Status date"
            type="date"
            disabled={followsSchedule}
            hintId={followsSchedule ? statusDateHintId : undefined}
          />
          {followsSchedule && (
            <FieldHint id={statusDateHintId}>
              {`Follows the current schedule (${currentScheduleName})`}
            </FieldHint>
          )}
        </div>
      </FieldRow>
      <FieldRow>
        <TextField name="startDate" label="Start date" type="date" />
        <TextField name="plannedFinishDate" label="Planned finish date" type="date" />
      </FieldRow>
    </>
  );
}
