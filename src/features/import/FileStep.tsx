import { Copy, Loader2 } from 'lucide-react';
import type { ReactElement, Ref } from 'react';
import { toast } from 'sonner';
import { FileDropzone } from '@/components/common/FileDropzone';
import { Button } from '@/components/ui/button';
import type { ID } from '@/data/types';
import { copyDetailsText } from '@/features/import/copy-details';
import { ProjectField } from '@/features/schedules/ProjectCombobox';
import {
  IMPORT_EXTENSIONS,
  MAX_SCHEDULE_BYTES,
  XLSX_MIME_TYPE,
} from '@/features/schedules/schedule-schema';

const FILE_HINT = 'Primavera P6 (.xer), MS Project XML (.xml), Excel (.xlsx) or CSV · up to 50 MB';
const ACCEPT_FILES = [...IMPORT_EXTENSIONS, '.mpp', '.xls', XLSX_MIME_TYPE];

export type FileInspectState =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'ready'; formatLabel: string }
  | {
      kind: 'refused';
      message: string;
      code: string | null;
      format: string | null;
      parserVersion: string | null;
    };

export interface FileStepProps {
  showProjectPicker: boolean;
  projectId: ID | null;
  onProjectChange(projectId: ID): void;
  projectError?: string;
  file: File | null;
  fileError?: string;
  onFileChange(file: File | null): void;
  inspectState: FileInspectState;
  disabled?: boolean;
  dropzoneRef?: Ref<HTMLButtonElement>;
}

/**
 * Step 1 of the stepped import dialog (spec §6.4): optional Project picker when opened from Home,
 * file dropzone accepting the four import formats plus refused `.mpp`/`.xls`, and live inspection
 * status ("Reading…", detected format name, or refusal with "Copy details").
 */
export function FileStep({
  showProjectPicker,
  projectId,
  onProjectChange,
  projectError,
  file,
  fileError,
  onFileChange,
  inspectState,
  disabled = false,
  dropzoneRef,
}: FileStepProps): ReactElement {
  async function handleCopyDetails(
    refused: Extract<FileInspectState, { kind: 'refused' }>,
  ): Promise<void> {
    if (file === null) return;
    const text = copyDetailsText({
      message: refused.message,
      code: refused.code,
      fileName: file.name,
      size: file.size,
      format: refused.format,
      parserVersion: refused.parserVersion,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Details copied');
    } catch {
      toast.error("Details couldn't be copied.");
    }
  }

  return (
    <>
      {showProjectPicker && (
        <ProjectField
          value={projectId}
          onChange={onProjectChange}
          error={projectError}
          disabled={disabled}
        />
      )}
      <FileDropzone
        ref={dropzoneRef}
        label="Schedule file"
        accept={ACCEPT_FILES}
        maxBytes={MAX_SCHEDULE_BYTES}
        hint={FILE_HINT}
        value={file}
        onChange={onFileChange}
        error={fileError}
        disabled={disabled}
      />
      {inspectState.kind === 'reading' && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Reading…
        </p>
      )}
      {inspectState.kind === 'ready' && (
        <p role="status" className="text-xs font-medium text-foreground">
          {inspectState.formatLabel}
        </p>
      )}
      {inspectState.kind === 'refused' && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3"
        >
          <p className="text-xs text-destructive">{inspectState.message}</p>
          {file !== null && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void handleCopyDetails(inspectState)}
                className="border-input bg-card dark:bg-card"
              >
                <Copy className="size-3.5" aria-hidden="true" />
                Copy details
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
