import { ChevronDown, ChevronUp, Filter, Search, X } from 'lucide-react';
import type { KeyboardEvent, ReactElement, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ScheduleSearchProps {
  inputRef?: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange(query: string): void;
  matches: readonly string[];
  activeIndex: number;
  onStep(delta: 1 | -1): void;
  filterActive: boolean;
  onToggleFilter(): void;
}

/**
 * Toolbar activity search control with match counter (`{i} of {n}`), prev/next stepping,
 * clear button, and ancestor-preserving Filter toggle (spec §7.2, S11).
 */
export function ScheduleSearch({
  inputRef,
  query,
  onQueryChange,
  matches,
  activeIndex,
  onStep,
  filterActive,
  onToggleFilter,
}: ScheduleSearchProps): ReactElement {
  const hasQuery = query.trim().length > 0;
  const countLabel =
    matches.length > 0
      ? `${Math.min(activeIndex, matches.length - 1) + 1} of ${matches.length}`
      : '0 of 0';

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape' && hasQuery) {
      event.preventDefault();
      onQueryChange('');
    }
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative flex items-center">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
        />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search activities"
          placeholder="Search activities…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="h-7 w-44 rounded-md border border-input bg-background pr-6 pl-7 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none sm:w-52"
        />
        {hasQuery && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onQueryChange('')}
            className="absolute right-1.5 flex size-4 items-center justify-center rounded-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {hasQuery && (
        <div className="flex items-center gap-0.5">
          <span className="min-w-12 text-center text-2xs text-muted-foreground tabular-nums">
            {countLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Previous match"
            disabled={matches.length === 0}
            onClick={() => onStep(-1)}
          >
            <ChevronUp className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Next match"
            disabled={matches.length === 0}
            onClick={() => onStep(1)}
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <Button
        type="button"
        variant={filterActive ? 'secondary' : 'outline'}
        size="xs"
        aria-pressed={filterActive}
        onClick={onToggleFilter}
        className={cn(
          'gap-1',
          !filterActive && 'border-input bg-card dark:bg-card',
          filterActive && 'border border-ring/50 text-foreground',
        )}
      >
        <Filter className="size-3" aria-hidden="true" />
        Filter
      </Button>
    </div>
  );
}
