import type { ReactElement } from 'react';
import { FieldRow, TextField } from '@/features/projects/steps/StepFields';

/** Step 4: where the project is (spec §6.7). */
export function LocationStep(): ReactElement {
  return (
    <>
      <TextField name="address" label="Address" />
      <FieldRow>
        <TextField name="city" label="City" />
        <TextField name="country" label="Country" />
      </FieldRow>
    </>
  );
}
