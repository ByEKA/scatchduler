import { X } from 'lucide-react';
import type { ReactElement } from 'react';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { cn } from '@/lib/utils';

/** One active filter: `label` names the filter, `value` what it keeps. */
export interface FilterChipItem {
  id: string;
  label: string;
  value: string;
}

/**
 * The active filters under a toolbar (P3 core spec §6.1): one chip per filter, "{filter}: {value}",
 * with its remove button, then the link-button "Clear filters". Nothing without filters.
 */
export function FilterChips({
  chips,
  onRemove,
  onClear,
}: {
  chips: readonly FilterChipItem[];
  onRemove(id: string): void;
  onClear(): void;
}): ReactElement | null {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border bg-card pr-1 pl-2.5 text-xs font-medium"
        >
          <span className="truncate">{`${chip.label}: ${chip.value}`}</span>
          <button
            type="button"
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => onRemove(chip.id)}
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground',
              FOCUS_OUTLINE_CLASSES,
            )}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className={cn(
          'rounded-sm text-xs font-semibold text-link underline-offset-2 hover:underline',
          FOCUS_OUTLINE_CLASSES,
        )}
      >
        Clear filters
      </button>
    </div>
  );
}
