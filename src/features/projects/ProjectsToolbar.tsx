import { LayoutGrid, List, ListFilter, Search } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  activeFilterCount,
  filterChips,
  PROJECT_SORT_OPTIONS,
  readProjectsView,
  withoutFilters,
  withViewParam,
  type ProjectsParam,
} from '@/features/projects/project-list';
import type { ProjectsLayout } from '@/hooks/useProjectsLayout';
import { isOptionValue, STAGE_OPTIONS, STATUS_OPTIONS, type Option } from '@/lib/project-options';
import { cn } from '@/lib/utils';

// Radix Select items can't have an empty value, so the "Any" item stands for no filter.
const ANY_VALUE = '__any__';

const LINK_BUTTON_CLASSES = cn(
  'rounded-sm text-xs font-semibold text-link underline-offset-2 hover:underline',
  FOCUS_OUTLINE_CLASSES,
);

// The generated toggle draws its focus ring at 50 %, below the 3:1 a focus ring needs (P1 spec
// §6.12); the full ring color is what the other controls use. Off items are muted, the pressed one
// gets the accent fill, full-strength text and a ring-colored outline: the fill alone is about
// 1.2 : 1 against the card, below the 3:1 a state needs, as for the select's highlighted option.
const LAYOUT_ITEM_CLASSES =
  'gap-1.5 px-2.5 text-muted-foreground focus-visible:ring-ring data-[state=on]:text-foreground data-[state=on]:outline-solid data-[state=on]:outline-2 data-[state=on]:-outline-offset-2 data-[state=on]:outline-ring';

/**
 * A labelled select with the popover shell of P1 spec §6.7: the label beside it in the toolbar, or
 * above it, as in a form, in the Filters popover (`stacked`).
 */
function ToolbarSelect({
  label,
  value,
  options,
  onChange,
  stacked = false,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<Option<string>>;
  onChange(value: string): void;
  stacked?: boolean;
}): ReactElement {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 gap-1.5', stacked ? 'flex-col' : 'items-center gap-2')}>
      <Label htmlFor={id} className="shrink-0 text-xs font-semibold">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className={cn('min-w-0 bg-card', stacked && 'w-full')}>
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
 * The search box's text while the URL catches up. The app's router applies URL changes in a
 * transition, and an input whose value waits for a transition loses keystrokes, so the box shows
 * what was typed until the URL holds it. `pending` lists the values written but not yet seen.
 */
interface SearchDraft {
  text: string;
  pending: readonly string[];
}

/**
 * The Projects toolbar (P3 core spec §6.2): search, the Filters popover, "Sort by", the layout
 * toggle and the filter chips. Search, filters and sort live in the URL (D21), and every change
 * replaces the history entry; the layout belongs to the caller (`useProjectsLayout`).
 */
export function ProjectsToolbar({
  layout,
  onLayoutChange,
}: {
  layout: ProjectsLayout;
  onLayoutChange(layout: ProjectsLayout): void;
}): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readProjectsView(searchParams);
  const count = activeFilterCount(view);

  const [draft, setDraft] = useState<SearchDraft | null>(null);
  // When the URL's search changes, the values written up to it are no longer pending. A value that
  // was never typed here (the filters were cleared, or the history moved) replaces the draft.
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

  function replaceParams(next: URLSearchParams): void {
    setSearchParams(next, { replace: true });
  }
  function setParam(key: ProjectsParam, value: string | null): void {
    replaceParams(withViewParam(searchParams, key, value));
  }
  function search(text: string): void {
    setDraft((current) => ({ text, pending: [...(current?.pending ?? []), text] }));
    setParam('q', text);
  }
  function clearFilters(): void {
    // The box empties at once, like typing it empty would.
    setDraft({ text: '', pending: [''] });
    replaceParams(withoutFilters(searchParams));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full md:w-64">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search projects…"
            aria-label="Search projects"
            autoComplete="off"
            value={searchText}
            onChange={(event) => search(event.target.value)}
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
              {count > 0 ? `Filters · ${count}` : 'Filters'}
            </Button>
          </PopoverTrigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              side="bottom"
              align="start"
              sideOffset={6}
              aria-label="Filters"
              className={cn(
                POPOVER_SHELL_CLASSES,
                'flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-3 p-3',
              )}
            >
              <ToolbarSelect
                label="Status"
                value={view.status ?? ANY_VALUE}
                options={[{ value: ANY_VALUE, label: 'Any' }, ...STATUS_OPTIONS]}
                onChange={(value) =>
                  setParam('status', isOptionValue(STATUS_OPTIONS, value) ? value : null)
                }
                stacked
              />
              <ToolbarSelect
                label="Stage"
                value={view.stage ?? ANY_VALUE}
                options={[{ value: ANY_VALUE, label: 'Any' }, ...STAGE_OPTIONS]}
                onChange={(value) =>
                  setParam('stage', isOptionValue(STAGE_OPTIONS, value) ? value : null)
                }
                stacked
              />
              <div className="flex justify-end border-t pt-2">
                <button type="button" onClick={clearFilters} className={LINK_BUTTON_CLASSES}>
                  Clear filters
                </button>
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </Popover>
        <ToolbarSelect
          label="Sort by"
          value={view.sort}
          options={PROJECT_SORT_OPTIONS}
          onChange={(value) => {
            if (isOptionValue(PROJECT_SORT_OPTIONS, value)) setParam('sort', value);
          }}
        />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Layout"
          value={layout}
          // A click on the pressed item would leave none pressed; the layout stays as it is.
          onValueChange={(value) => {
            if (value === 'tiles' || value === 'list') onLayoutChange(value);
          }}
          className="bg-card md:ml-auto"
        >
          <ToggleGroupItem value="tiles" className={LAYOUT_ITEM_CLASSES}>
            <LayoutGrid aria-hidden="true" />
            <span className="max-sm:sr-only">Tiles</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className={LAYOUT_ITEM_CLASSES}>
            <List aria-hidden="true" />
            <span className="max-sm:sr-only">List</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <FilterChips
        chips={filterChips(view)}
        onRemove={(id) => {
          if (id === 'status' || id === 'stage') setParam(id, null);
        }}
        onClear={clearFilters}
      />
    </div>
  );
}
