import { Search } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import {
  POPOVER_SHELL_CLASSES,
  SELECT_ITEM_HIGHLIGHT_CLASSES,
} from '@/components/common/popover-classes';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FILES_SORT_OPTIONS,
  FILES_TAG_OPTIONS,
  hasActiveFilesFilters,
  type FilesSortKey,
  type FilesTagFilter,
  type FilesView,
} from '@/features/files/files-list';
import { cn } from '@/lib/utils';

interface SearchDraft {
  text: string;
  pending: readonly string[];
}

const LINK_BUTTON_CLASSES = cn(
  'rounded-sm text-xs font-semibold text-link underline-offset-2 hover:underline',
  FOCUS_OUTLINE_CLASSES,
);

function FilesSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(value: T): void;
}): ReactElement {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label htmlFor={id} className="shrink-0 text-xs font-semibold">
        {label}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} size="sm" className="min-w-0 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            side="bottom"
            align="start"
            sideOffset={6}
            className={cn(
              POPOVER_SHELL_CLASSES,
              'max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-y-auto',
            )}
          >
            <SelectPrimitive.Viewport>
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className={cn('h-8 py-0', SELECT_ITEM_HIGHLIGHT_CLASSES)}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </Select>
    </div>
  );
}

/**
 * Toolbar for the Project Files page (spec §7.2.2): search input, tag filter, sort selector,
 * and "Show archived" checkbox synced to URL params.
 */
export function FilesToolbar({
  view,
  onUpdateView,
  onClearFilters,
}: {
  view: FilesView;
  onUpdateView(patch: Partial<FilesView>): void;
  onClearFilters(): void;
}): ReactElement {
  const archivedId = useId();

  // Keep immediate search text while React Router applies URL transitions.
  const [draft, setDraft] = useState<SearchDraft | null>(null);
  const [seenQuery, setSeenQuery] = useState(view.q);
  if (seenQuery !== view.q) {
    setSeenQuery(view.q);
    if (draft !== null) {
      const index = draft.pending.lastIndexOf(view.q);
      const pending = index === -1 ? [] : draft.pending.slice(index + 1);
      setDraft(pending.length === 0 ? null : { text: draft.text, pending });
    }
  }
  const searchText = draft?.text ?? view.q;

  const [pendingArchived, setPendingArchived] = useState<boolean | null>(null);
  if (pendingArchived !== null && pendingArchived === view.archived) {
    setPendingArchived(null);
  }
  const showArchived = pendingArchived ?? view.archived;

  function handleSearchChange(text: string): void {
    setDraft((current) => ({ text, pending: [...(current?.pending ?? []), text] }));
    onUpdateView({ q: text });
  }

  function handleClear(): void {
    setDraft({ text: '', pending: [''] });
    onClearFilters();
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative w-full sm:w-60">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Search schedules…"
          aria-label="Search schedules"
          autoComplete="off"
          value={searchText}
          onChange={(event) => handleSearchChange(event.target.value)}
          className="h-8 bg-card pl-8"
        />
      </div>

      <FilesSelect<FilesTagFilter>
        label="Tag"
        value={view.tag}
        options={FILES_TAG_OPTIONS}
        onChange={(tag) => onUpdateView({ tag })}
      />

      <FilesSelect<FilesSortKey>
        label="Sort by"
        value={view.sort}
        options={FILES_SORT_OPTIONS}
        onChange={(sort) => onUpdateView({ sort })}
      />

      <div className="flex items-center gap-2 sm:ml-auto">
        <Checkbox
          id={archivedId}
          checked={showArchived}
          onCheckedChange={(value) => {
            const next = value === true;
            setPendingArchived(next);
            onUpdateView({ archived: next });
          }}
          className="bg-card"
        />
        <Label htmlFor={archivedId} className="text-sm font-normal">
          Show archived
        </Label>
      </div>

      {hasActiveFilesFilters(view) && (
        <button type="button" onClick={handleClear} className={LINK_BUTTON_CLASSES}>
          Clear filters
        </button>
      )}
    </div>
  );
}
