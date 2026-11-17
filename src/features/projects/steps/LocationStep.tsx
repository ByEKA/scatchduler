import { useId } from 'react';
import type { ClipboardEvent, ReactElement } from 'react';
import { useFormContext } from 'react-hook-form';
import { splitCoordinatePair } from '@/features/projects/coordinates';
import type { ProjectFormValues } from '@/features/projects/project-schema';
import {
  FieldHint,
  FieldRow,
  TextField,
  useWizardFields,
} from '@/features/projects/steps/StepFields';

const COORDINATE_HINT =
  'Decimal degrees, for example 41.0151 and 28.9795. Paste both into Latitude to fill the two fields.';

/** Step 4: where the project is, with its coordinates (P3 core spec §6.4; P1 spec §6.7). */
export function LocationStep(): ReactElement {
  const {
    setValue,
    trigger,
    formState: { isSubmitted },
  } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const hintId = useId();

  // A latitude and longitude pasted together into Latitude fill the two fields.
  function pasteCoordinates(event: ClipboardEvent<HTMLInputElement>): void {
    if (locked) return;
    const pair = splitCoordinatePair(event.clipboardData.getData('text/plain'));
    if (pair === null) return;
    event.preventDefault();
    const [latitude, longitude] = pair;
    setValue('latitude', latitude, { shouldDirty: true });
    setValue('longitude', longitude, { shouldDirty: true });
    // After a submit, fields check themselves as they change; the pair is checked once both are in.
    if (isSubmitted) void trigger(['latitude', 'longitude']);
    onFieldChange('latitude');
    onFieldChange('longitude');
  }

  return (
    <>
      <TextField name="address" label="Address" />
      <FieldRow>
        <TextField name="city" label="City" />
        <TextField name="country" label="Country" />
      </FieldRow>
      <div className="flex flex-col gap-1.5">
        <FieldRow>
          <TextField
            name="latitude"
            label="Latitude"
            hintId={hintId}
            deps={['longitude']}
            onPaste={pasteCoordinates}
          />
          <TextField name="longitude" label="Longitude" hintId={hintId} deps={['latitude']} />
        </FieldRow>
        <FieldHint id={hintId}>{COORDINATE_HINT}</FieldHint>
      </div>
    </>
  );
}
