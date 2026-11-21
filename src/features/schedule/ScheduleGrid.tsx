import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  Folder,
  FolderOpen,
  Repeat,
} from 'lucide-react';
import { useMemo, useRef } from 'react';
import type { KeyboardEvent, ReactElement, ReactNode, RefObject, UIEvent } from 'react';
import {
  formatPercent,
  formatScheduleDate,
  formatWorkingDays,
} from '@/features/schedule/format-schedule';
import {
  SCHEDULE_HEADER_HEIGHT,
  SCHEDULE_ROW_HEIGHT,
  type VisibleRow,
} from '@/features/schedule/rows';
import { cn } from '@/lib/utils';

export type EditableGridColumn = 'code' | 'name' | 'duration' | 'percent' | 'predecessors';

export interface ScheduleGridProps {
  rows: readonly VisibleRow[];
  selectedKey: string | null;
  showCritical?: boolean;
  onSelectKey(key: string | null): void;
  onToggleWbs(wbsId: string): void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onScroll?: (scrollTop: number) => void;
  renderCellOverride?: (row: VisibleRow, column: EditableGridColumn) => ReactNode | undefined;
  onActivateEditCell?: (row: VisibleRow, column: EditableGridColumn) => void;
}

const COLUMN_WIDTHS = {
  index: 'w-10 shrink-0 text-right',
  code: 'w-24 shrink-0',
  name: 'min-w-[200px] flex-1',
  duration: 'w-16 shrink-0 text-right',
  start: 'w-24 shrink-0',
  finish: 'w-24 shrink-0',
  totalFloat: 'w-20 shrink-0 text-right',
  percent: 'w-20 shrink-0 text-right',
  predecessors: 'w-32 shrink-0',
} as const;

const EDITABLE_BY_COLUMN: Partial<Record<string, EditableGridColumn>> = {
  code: 'code',
  name: 'name',
  duration: 'duration',
  percent: 'percent',
  predecessors: 'predecessors',
};

function RowTypeIcon({ row }: { row: VisibleRow }): ReactElement | null {
  if (row.kind === 'wbs') {
    return row.isCollapsed ? (
      <Folder className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    ) : (
      <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    );
  }
  if (row.activityType === 'start_milestone' || row.activityType === 'finish_milestone') {
    return <Diamond className="size-3 shrink-0 text-gantt-milestone" aria-hidden="true" />;
  }
  if (row.activityType === 'level_of_effort') {
    return <Repeat className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  return null;
}

/**
 * Virtualized WBS + Activity treegrid built on `@tanstack/react-table` and `@tanstack/react-virtual`
 * (spec §7.2, S11). Maintains fixed 32 px row height for pixel-locked scroll sync with `ScheduleGantt`.
 */
export function ScheduleGrid({
  rows,
  selectedKey,
  showCritical = true,
  onSelectKey,
  onToggleWbs,
  scrollContainerRef,
  onScroll,
  renderCellOverride,
  onActivateEditCell,
}: ScheduleGridProps): ReactElement {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef ?? internalScrollRef;

  const columns = useMemo<ColumnDef<VisibleRow>[]>(
    () => [
      {
        id: 'index',
        header: '#',
        meta: { className: COLUMN_WIDTHS.index },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{row.original.rowIndex}</span>
        ),
      },
      {
        id: 'code',
        header: 'Code',
        meta: { className: COLUMN_WIDTHS.code },
        cell: ({ row }) => {
          const override = renderCellOverride?.(row.original, 'code');
          if (override !== undefined) return override;
          return (
            <span className="truncate font-mono text-xs" title={row.original.code}>
              {row.original.code}
            </span>
          );
        },
      },
      {
        id: 'name',
        header: 'Name',
        meta: { className: COLUMN_WIDTHS.name },
        cell: ({ row }) => {
          const item = row.original;
          const override = renderCellOverride?.(item, 'name');
          return (
            <div
              className="flex min-w-0 flex-1 items-center gap-1"
              style={{ paddingLeft: `${item.depth * 16}px` }}
            >
              {item.kind === 'wbs' ? (
                <button
                  type="button"
                  aria-label={`${item.isCollapsed ? 'Expand' : 'Collapse'} ${item.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleWbs(item.id);
                  }}
                  className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {item.isCollapsed ? (
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span className="w-5 shrink-0" aria-hidden="true" />
              )}
              <RowTypeIcon row={item} />
              {override !== undefined ? (
                override
              ) : (
                <span
                  title={item.name}
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    item.kind === 'wbs' && 'font-semibold',
                  )}
                >
                  {item.name}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'duration',
        header: 'Duration',
        meta: { className: COLUMN_WIDTHS.duration },
        cell: ({ row }) => {
          const override = renderCellOverride?.(row.original, 'duration');
          if (override !== undefined) return override;
          return (
            <span className="tabular-nums">
              {formatWorkingDays(row.original.durationMinutes, row.original.hoursPerDay)}
            </span>
          );
        },
      },
      {
        id: 'start',
        header: 'Start',
        meta: { className: COLUMN_WIDTHS.start },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatScheduleDate(row.original.start)}</span>
        ),
      },
      {
        id: 'finish',
        header: 'Finish',
        meta: { className: COLUMN_WIDTHS.finish },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatScheduleDate(row.original.finish)}</span>
        ),
      },
      {
        id: 'totalFloat',
        header: 'Total float',
        meta: { className: COLUMN_WIDTHS.totalFloat },
        cell: ({ row }) => {
          const item = row.original;
          return (
            <span
              className={cn(
                'tabular-nums',
                showCritical &&
                  item.kind === 'activity' &&
                  item.isCritical &&
                  'font-medium text-gantt-critical',
              )}
            >
              {formatWorkingDays(item.totalFloat, item.hoursPerDay, { signed: true })}
            </span>
          );
        },
      },
      {
        id: 'percent',
        header: '% complete',
        meta: { className: COLUMN_WIDTHS.percent },
        cell: ({ row }) => {
          const override = renderCellOverride?.(row.original, 'percent');
          if (override !== undefined) return override;
          return <span className="tabular-nums">{formatPercent(row.original.percentComplete)}</span>;
        },
      },
      {
        id: 'predecessors',
        header: 'Predecessors',
        meta: { className: COLUMN_WIDTHS.predecessors },
        cell: ({ row }) => {
          const override = renderCellOverride?.(row.original, 'predecessors');
          if (override !== undefined) return override;
          return (
            <span
              className="truncate font-mono text-xs text-muted-foreground"
              title={row.original.predecessorsLabel || undefined}
            >
              {row.original.predecessorsLabel || '—'}
            </span>
          );
        },
      },
    ],
    [onToggleWbs, renderCellOverride, showCritical],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table manages its own memoized model.
  const table = useReactTable({
    data: rows as VisibleRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.key,
  });

  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => SCHEDULE_ROW_HEIGHT,
    overscan: 10,
    initialRect: { width: 560, height: 480 },
    observeElementRect: (instance, cb) => {
      const el = instance.scrollElement;
      if (!el) return;
      const measure = () => {
        const rect = el.getBoundingClientRect();
        const width = el.offsetWidth || rect.width || 560;
        const height = el.offsetHeight || rect.height || 480;
        cb({ width, height });
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => measure());
      observer.observe(el);
      return () => observer.disconnect();
    },
  });

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    onScroll?.(event.currentTarget.scrollTop);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (
      target !== null &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    ) {
      return;
    }

    if (rows.length === 0) return;

    const currentIndex = selectedKey ? rows.findIndex((r) => r.key === selectedKey) : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : Math.min(rows.length - 1, currentIndex + 1);
      onSelectKey(rows[nextIndex]!.key);
      virtualizer.scrollToIndex(nextIndex);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1);
      onSelectKey(rows[prevIndex]!.key);
      virtualizer.scrollToIndex(prevIndex);
      return;
    }

    if (currentIndex < 0) return;
    const currentRow = rows[currentIndex]!;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (currentRow.kind === 'wbs' && !currentRow.isCollapsed) {
        onToggleWbs(currentRow.id);
      } else if (currentRow.parentWbsId !== null) {
        onSelectKey(`wbs:${currentRow.parentWbsId}`);
      }
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (currentRow.kind === 'wbs' && currentRow.isCollapsed) {
        onToggleWbs(currentRow.id);
      }
      return;
    }

    if (event.key === 'Enter' && onActivateEditCell) {
      event.preventDefault();
      onActivateEditCell(currentRow, 'name');
    }
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      role="treegrid"
      aria-label="Schedule activities"
      aria-rowcount={rows.length + 1}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className="relative flex-1 overflow-auto text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="min-w-[820px]">
        {/* Sticky header row aligned with the 44 px Gantt timescale header */}
        <div
          role="row"
          aria-rowindex={1}
          style={{ height: `${SCHEDULE_HEADER_HEIGHT}px` }}
          className="sticky top-0 z-10 flex items-center border-b border-gantt-grid-line bg-muted/60 text-2xs font-medium tracking-[0.02em] text-muted-foreground backdrop-blur-xs"
        >
          {table.getHeaderGroups().map((group) =>
            group.headers.map((header) => {
              const meta = header.column.columnDef.meta as { className?: string } | undefined;
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  className={cn(
                    'flex h-full items-center px-2 select-none',
                    meta?.className,
                    meta?.className?.includes('text-right') && 'justify-end',
                  )}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              );
            }),
          )}
        </div>

        {/* Virtualized rows body */}
        {tableRows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            No activities to display.
          </div>
        ) : (
          <div
            role="rowgroup"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
            className="relative w-full"
          >
            {virtualItems.map((virtualRow) => {
              const row = tableRows[virtualRow.index]!;
              const item = row.original;
              const isSelected = item.key === selectedKey;
              return (
                <div
                  key={row.id}
                  role="row"
                  tabIndex={-1}
                  aria-rowindex={item.rowIndex + 1}
                  aria-level={item.depth + 1}
                  aria-expanded={item.kind === 'wbs' ? !item.isCollapsed : undefined}
                  aria-selected={isSelected}
                  onClick={() => onSelectKey(item.key)}
                  onKeyDown={(event) => {
                    if (event.key === ' ') {
                      event.preventDefault();
                      onSelectKey(item.key);
                    }
                  }}
                  style={{
                    height: `${SCHEDULE_ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={cn(
                    'absolute top-0 left-0 flex w-full cursor-pointer items-center border-b border-gantt-grid-line/70 transition-colors',
                    item.kind === 'wbs' && 'bg-muted/30',
                    isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { className?: string } | undefined;
                    const editableCol = EDITABLE_BY_COLUMN[cell.column.id];
                    return (
                      <div
                        key={cell.id}
                        role="gridcell"
                        tabIndex={-1}
                        onDoubleClick={
                          editableCol && onActivateEditCell
                            ? (event) => {
                                event.stopPropagation();
                                onActivateEditCell(item, editableCol);
                              }
                            : undefined
                        }
                        className={cn(
                          'flex h-full min-w-0 items-center overflow-hidden px-2',
                          meta?.className,
                          meta?.className?.includes('text-right') && 'justify-end',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
