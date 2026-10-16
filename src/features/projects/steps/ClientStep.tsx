import type { ReactElement } from 'react';
import { FieldRow, TextField } from '@/features/projects/steps/StepFields';

/** Step 3: the client and a contact person (spec §6.7). */
export function ClientStep(): ReactElement {
  return (
    <>
      <TextField name="clientName" label="Client name" />
      <FieldRow>
        <TextField name="contactName" label="Contact person" />
        <TextField name="contactEmail" label="Contact email" type="email" />
      </FieldRow>
    </>
  );
}
