import { FileUp, XIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { fileSize } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface FileDropzoneProps {
  /** Visible field label; also the accessible name of the drop area and of the file input. */
  label: string;
  /** Extensions or MIME types for the browser's file picker, e.g. `['.xer', '.xml']`. */
  accept: string[];
  /** The limit the form's schema enforces; the dropzone itself never validates. */
  maxBytes: number;
  hint: string;
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  /** Height of the drop area in px; 140 by default. */
  height?: number;
  icon?: LucideIcon;
}

/**
 * A drop area that is also a button opening the file picker (spec §6.6). It passes the chosen
 * or dropped file up as it is; the form's zod schema checks type and size.
 */
export function FileDropzone({
  label,
  accept,
  hint,
  value,
  onChange,
  error,
  height = 140,
  icon: Icon = FileUp,
}: FileDropzoneProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const hintId = useId();
  const errorId = useId();

  function handleDragOver(event: DragEvent<HTMLButtonElement>): void {
    // Without preventDefault the browser opens the file instead of firing `drop`.
    event.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>): void {
    // Moving over the icon or the text fires dragleave on the button too.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>): void {
    event.preventDefault();
    setDragOver(false);
    const file = Array.from(event.dataTransfer.files)[0];
    if (file) onChange(file);
  }

  function removeFile(): void {
    // "Remove file" unmounts with the chip, so focus moves to the drop area instead of the page.
    buttonRef.current?.focus();
    onChange(null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    // Cleared so that choosing the same file again after "Remove file" fires a change.
    event.target.value = '';
    if (file) onChange(file);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ height }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 text-center transition-colors outline-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring',
          dragOver && 'border-brand-400 bg-brand-500/5',
          error && 'border-destructive',
        )}
      >
        <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">Drop a file here or click to browse</span>
        <span id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        aria-label={label}
        accept={accept.join(',')}
        tabIndex={-1}
        className="sr-only"
        onChange={handleInputChange}
      />
      {value && (
        <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted py-1 pr-1 pl-2.5">
          <span className="min-w-0 flex-1 truncate text-sm" title={value.name}>
            {value.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{fileSize(value.size)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove file"
            onClick={removeFile}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
