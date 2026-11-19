import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
} from '@tanstack/react-table';
import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { SectionError } from '@/components/common/SectionError';
import { ROW_LINK_CLASSES, TABLE_HEADER_CELL_CLASSES } from '@/components/common/table-classes';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- an augmentation repeats TanStack's type parameters
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes for the column's header and body cells, such as `hidden lg:table-cell`. */
    className?: string;
    /** The column whose cells start with the row link; without one, the first column. */
    link?: boolean;
  }
}

/** Where a row leads: `label` is the link text, `title` its tooltip (lines split by `\n`). */
export interface DataTableRowLink {
  to: string;
  label: string;
  title: string;
}

export interface DataTableProps<TRow> {
  columns: ReadonlyArray<ColumnDef<TRow, unknown>>;
  data: readonly TRow[];
  getRowId(row: TRow): string;
  /** Names the table for assistive technology; it isn't shown. */
  caption: string;
  state: 'loading' | 'error' | 'ready';
  /** The failed read, shown when `state` is `'error'`. */
  error?: unknown;
  /** Retry for the error state; without it the error shows no Retry button. */
  onRetry?: () => void;
  /** Shown in one full-width row when the table is ready without rows. */
  empty: ReactNode;
  /** Makes each row a link: the link column's cell starts with it, and it covers the row. */
  rowLink?: (row: TRow) => DataTableRowLink;
  rowClassName?: (row: TRow) => string | undefined;
}

const SKELETON_ROW_COUNT = 5;

// 20 px from the panel's edges, 8 px between columns; labels and values stay on one line.
const CELL_CLASSES = 'px-2 whitespace-nowrap first:pl-5 last:pr-5';

// Buttons in a cell (the row menu) sit above the stretched row link, so they stay clickable.
const BODY_CELL_CLASSES = cn(CELL_CLASSES, 'text-sm [&_button]:relative [&_button]:z-10');

/**
 * A table with the look of Home's shared schedules (P3 core spec §6.1): a hidden caption, the app's
 * header cells, an optional stretched link per row, five skeleton rows while loading and one
 * full-width row for the empty and the error state. A column's `meta.className` applies to its
 * header and body cells.
 */
export function DataTable<TRow>({
  columns,
  data,
  getRowId,
  caption,
  state,
  error,
  onRetry,
  empty,
  rowLink,
  rowClassName,
}: DataTableProps<TRow>): ReactElement {
  // TanStack Table never changes these arrays; the copies only satisfy its mutable array types.
  const columnList = useMemo(() => [...columns], [columns]);
  const rows = useMemo(() => [...data], [data]);
  // The app doesn't run React Compiler, and the table's functions are only called during this
  // render, never handed to a memoized child, so nothing can read a stale table.
  // eslint-disable-next-line react-hooks/incompatible-library -- see the comment above
  const table = useReactTable({
    columns: columnList,
    data: rows,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });

  const leafColumns = table.getVisibleLeafColumns();
  const linkColumnId = (leafColumns.find((column) => column.columnDef.meta?.link) ?? leafColumns[0])
    ?.id;

  function fullRow(content: ReactNode): ReactElement {
    return (
      <tr>
        <td colSpan={leafColumns.length} className="px-5 py-12">
          {content}
        </td>
      </tr>
    );
  }

  function body(): ReactNode {
    if (state === 'loading') {
      return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <tr
          key={index}
          data-testid="data-table-skeleton-row"
          aria-hidden="true"
          className="h-14 border-b last:border-b-0"
        >
          {leafColumns.map((column) => (
            <td key={column.id} className={cn(CELL_CLASSES, column.columnDef.meta?.className)}>
              <Skeleton className="h-3.5 w-3/4" />
            </td>
          ))}
        </tr>
      ));
    }
    if (state === 'error') {
      // Without onRetry, SectionError leaves Retry out rather than show a button that does nothing.
      return fullRow(<SectionError error={error} onRetry={onRetry} />);
    }
    const tableRows = table.getRowModel().rows;
    if (tableRows.length === 0) return fullRow(empty);
    return tableRows.map((row) => {
      const link = rowLink?.(row.original);
      return (
        <tr
          key={row.id}
          className={cn(
            'relative h-14 border-b transition-colors duration-150 ease-standard last:border-b-0',
            link !== undefined && 'hover:bg-accent/40',
            rowClassName?.(row.original),
          )}
        >
          {row.getVisibleCells().map((cell) => (
            <td
              key={cell.id}
              className={cn(BODY_CELL_CLASSES, cell.column.columnDef.meta?.className)}
            >
              {link !== undefined && cell.column.id === linkColumnId && (
                // The link covers the whole row, so a title on any other cell never shows.
                <Link to={link.to} title={link.title} className={ROW_LINK_CLASSES}>
                  {link.label}
                </Link>
              )}
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      );
    });
  }

  return (
    // relative: the visually hidden caption and header labels are absolutely positioned (sr-only);
    // without a positioned ancestor they escape this scroll box and widen the page on phones.
    <div className="relative overflow-x-auto rounded-lg bg-card ring-1 ring-edge">
      <table className="w-full">
        <caption className="sr-only">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="h-10 border-b bg-muted/50">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className={cn(
                    TABLE_HEADER_CELL_CLASSES,
                    CELL_CLASSES,
                    header.column.columnDef.meta?.className,
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>{body()}</tbody>
      </table>
    </div>
  );
}
