import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactElement } from 'react';
import { cn } from '@/lib/utils';

export interface InlineCellEditorProps {
  initialValue: string;
  ariaLabel: string;
  align?: 'left' | 'right';
  mono?: boolean;
  onCommit(value: string): void;
  onCancel(): void;
}

/**
 * Compact inline text editor mounted inside an active `ScheduleGrid` cell in Edit mode
 * (spec §7.2). Commits on Enter or blur; cancels cleanly on Escape without committing.
 */
export function InlineCellEditor({
  initialValue,
  ariaLabel,
  align = 'left',
  mono = false,
  onCommit,
  onCancel,
}: InlineCellEditorProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(value);
  };

  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        'h-6 w-full min-w-0 rounded-xs border border-ring bg-background px-1.5 text-xs text-foreground outline-none',
        align === 'right' && 'text-right tabular-nums',
        mono && 'font-mono',
      )}
    />
  );
}
