import type { ReactElement } from 'react';
import { FieldRow, SelectField, TextField } from '@/features/projects/steps/StepFields';
import {
  PROJECT_TYPE_OPTIONS,
  SECTOR_OPTIONS,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
} from '@/lib/project-options';

/**
 * Step 2: status, stage, project type, sector and the three dates, as native date inputs (P3 core
 * spec §6.4; P1 spec §6.7, D7). Status always has a value; the other selects start with "None".
 */
export function AttributesStep(): ReactElement {
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
        <TextField name="statusDate" label="Status date" type="date" />
      </FieldRow>
      <FieldRow>
        <TextField name="startDate" label="Start date" type="date" />
        <TextField name="plannedFinishDate" label="Planned finish date" type="date" />
      </FieldRow>
    </>
  );
}
