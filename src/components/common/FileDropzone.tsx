import { FileUp, XIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactElement, Ref } from 'react';
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
  /** Set while the form saves: the drop area, drops and "Remove file" do nothing. */
  disabled?: boolean;
  /**
   * Shows a 96×64 preview of a chosen image in the file chip. A file outside `accept` or over
   * `maxBytes` gets none: the form rejects it, and decoding a large image only to show it small
   * costs memory.
   */
  thumbnail?: boolean;
  /** The drop area button, so a form can focus the field when its value is invalid. */
  ref?: Ref<HTMLButtonElement>;
}

/** The image through an object URL, which reads the file without copying it; decorative. */
function ImageThumbnail({ file }: { file: File }): ReactElement {
  // A ref callback with cleanup points the image at each new file and frees the URL it replaced.
  const showFile = useCallback(
    (image: HTMLImageElement | null) => {
      if (image === null) return;
      const url = URL.createObjectURL(file);
      image.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  return (
    <img
      ref={showFile}
      alt=""
      className="h-16 w-24 shrink-0 rounded-sm bg-background object-cover"
    />
  );
}

/** True when an `accept` entry (an extension, a MIME type or `type/*`) names the file, in any case. */
function isAccepted(file: File, accept: string[]): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept.some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (pattern.startsWith('.')) return name.endsWith(pattern);
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * A drop area that is also a button opening the file picker (spec §6.6). It passes the chosen
 * or dropped file up as it is; the form's zod schema checks type and size.
 */
export function FileDropzone({
  label,
  accept,
  maxBytes,
  hint,
  value,
  onChange,
  error,
  height = 140,
  icon: Icon = FileUp,
  disabled = false,
  thumbnail = false,
  ref,
}: FileDropzoneProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  const [dragOver, setDragOver] = useState(false);
  const hintId = useId();
  const errorId = useId();

  function handleDragOver(event: DragEvent<HTMLButtonElement>): void {
    // Without preventDefault the browser opens the file instead of firing `drop`.
    event.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>): void {
    // Moving over the icon or the text fires dragleave on the button too.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragOver(false);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>): void {
    // Still prevented while disabled, or the browser would open the dropped file.
    event.preventDefault();
    setDragOver(false);
    if (disabled) return;
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
        ref={setButtonRef}
        type="button"
        aria-label={label}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ height }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input px-4 text-center transition-colors outline-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
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
        <div
          className={cn(
            'flex min-w-0 items-center gap-2 rounded-md bg-muted py-1 pr-1 pl-2.5',
            thumbnail && 'gap-3 pl-1',
          )}
        >
          {thumbnail &&
            value.type.startsWith('image/') &&
            isAccepted(value, accept) &&
            value.size <= maxBytes && <ImageThumbnail file={value} />}
          <span className="min-w-0 flex-1 truncate text-sm" title={value.name}>
            {value.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{fileSize(value.size)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Remove file"
            disabled={disabled}
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
