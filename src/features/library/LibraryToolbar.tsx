import { ListFilter, Search } from 'lucide-react';
import { Popover as PopoverPrimitive, Select as SelectPrimitive } from 'radix-ui';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router';
import { FilterChips } from '@/components/common/FilterChips';
import {
  POPOVER_SHELL_CLASSES,
  SELECT_ITEM_HIGHLIGHT_CLASSES,
} from '@/components/common/popover-classes';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { WorkspaceSummary } from '@/data/types';
import {
  activeLibraryFilterCount,
  clearLibraryFilters,
  LIBRARY_SOURCE_OPTIONS,
  LIBRARY_TAG_OPTIONS,
  libraryFilterChips,
  readLibraryView,
  withLibraryViewParams,
  type LibrarySourceFilter,
  type LibraryTagFilter,
  type LibraryView,
} from '@/features/library/library-list';
import { cn } from '@/lib/utils';

const ANY_WORKSPACE = '__any__';

const LINK_BUTTON_CLASSES = cn(
  'rounded-sm text-xs font-semibold text-link underline-offset-2 hover:underline',
  FOCUS_OUTLINE_CLASSES,
);

function PopoverSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange(value: string): void;
}): ReactElement {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="w-full min-w-0 bg-card">
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

interface SearchDraft {
  text: string;
  pending: readonly string[];
}

/**
 * Toolbar for the cross-workspace Schedule Library page (spec §7.1):
 * search, Filters popover (Workspace, Tag, Source), Show archived, Hide empty, and FilterChips.
 */
export function LibraryToolbar({
  workspaces,
}: {
  workspaces: readonly WorkspaceSummary[];
}): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readLibraryView(searchParams);
  const filterCount = activeLibraryFilterCount(view);
  const archivedId = useId();
  const nonEmptyId = useId();

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

  const [pendingNonEmpty, setPendingNonEmpty] = useState<boolean | null>(null);
  if (pendingNonEmpty !== null && pendingNonEmpty === view.nonEmpty) {
    setPendingNonEmpty(null);
  }
  const hideEmpty = pendingNonEmpty ?? view.nonEmpty;

  const updateView = (patch: Partial<LibraryView>) => {
    setSearchParams((prev) => withLibraryViewParams(prev, patch), { replace: true });
  };

  const handleSearchChange = (text: string) => {
    setDraft((current) => ({ text, pending: [...(current?.pending ?? []), text] }));
    updateView({ q: text });
  };

  const handleClearFilters = () => {
    setDraft({ text: '', pending: [''] });
    setPendingArchived(false);
    setPendingNonEmpty(false);
    setSearchParams((prev) => clearLibraryFilters(prev), { replace: true });
  };

  const workspaceOptions = [
    { value: ANY_WORKSPACE, label: 'Any' },
    ...workspaces.map((ws) => ({ value: ws.id, label: ws.name })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full md:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search schedules…"
            aria-label="Search library"
            autoComplete="off"
            value={searchText}
            onChange={(event) => handleSearchChange(event.target.value)}
            className="h-8 bg-card pl-8"
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-input bg-card dark:bg-card"
            >
              <ListFilter aria-hidden="true" />
              {filterCount > 0 ? `Filters · ${filterCount}` : 'Filters'}
            </Button>
          </PopoverTrigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              side="bottom"
              align="start"
              sideOffset={6}
              aria-label="Library filters"
              className={cn(
                POPOVER_SHELL_CLASSES,
                'flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-3 p-3',
              )}
            >
              <PopoverSelect
                label="Workspace"
                value={view.workspace ?? ANY_WORKSPACE}
                options={workspaceOptions}
                onChange={(value) =>
                  updateView({ workspace: value === ANY_WORKSPACE ? null : value })
                }
              />
              <PopoverSelect
                label="Tag"
                value={view.tag}
                options={LIBRARY_TAG_OPTIONS}
                onChange={(value) => updateView({ tag: value as LibraryTagFilter })}
              />
              <PopoverSelect
                label="Source"
                value={view.source}
                options={LIBRARY_SOURCE_OPTIONS}
                onChange={(value) => updateView({ source: value as LibrarySourceFilter })}
              />
              <div className="flex justify-end border-t pt-2">
                <button type="button" onClick={handleClearFilters} className={LINK_BUTTON_CLASSES}>
                  Clear filters
                </button>
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </Popover>

        <div className="flex items-center gap-2">
          <Checkbox
            id={archivedId}
            checked={showArchived}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setPendingArchived(next);
              updateView({ archived: next });
            }}
            className="bg-card"
          />
          <Label htmlFor={archivedId} className="text-sm font-normal">
            Show archived
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={nonEmptyId}
            checked={hideEmpty}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setPendingNonEmpty(next);
              updateView({ nonEmpty: next });
            }}
            className="bg-card"
          />
          <Label htmlFor={nonEmptyId} className="text-sm font-normal">
            Hide empty
          </Label>
        </div>
      </div>

      <FilterChips
        chips={libraryFilterChips(view, workspaces)}
        onRemove={(id) => {
          if (id === 'workspace') updateView({ workspace: null });
          else if (id === 'tag') updateView({ tag: 'all' });
          else if (id === 'source') updateView({ source: 'all' });
        }}
        onClear={handleClearFilters}
      />
    </div>
  );
}
