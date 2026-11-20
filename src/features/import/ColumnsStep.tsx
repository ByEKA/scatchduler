import { Select as SelectPrimitive } from 'radix-ui';
import { useId } from 'react';
import type { ReactElement } from 'react';
import {
  POPOVER_SHELL_CLASSES,
  SELECT_ITEM_HIGHLIGHT_CLASSES,
} from '@/components/common/popover-classes';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type {
  ImportDateFormat,
  ImportField,
  ImportReport,
  TableMapping,
  TextEncodingName,
} from '@/data/types';
import {
  BOM_ENCODING_LABELS,
  columnLetter,
  DATE_FORMAT_OPTIONS,
  DECIMAL_OPTIONS,
  DELIMITER_OPTIONS,
  DURATION_UNIT_OPTIONS,
  ENCODING_LABELS,
  IMPORT_FIELD_LABELS,
  IMPORT_FIELD_ORDER,
  PREDECESSOR_REF_OPTIONS,
  ROWS_WITH_PROBLEMS_OPTIONS,
  TEXT_ENCODING_OPTIONS,
  type ColumnErrorKey,
} from '@/features/import/import-schema';
import type { TablePreview } from '@/hooks/useImportParser';
import { cn } from '@/lib/utils';

const NONE_VALUE = '__none__';

interface OptionItem {
  value: string;
  label: string;
}

function ImportSelect({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  disabled = false,
  registerRef,
}: {
  label: string;
  value: string;
  options: readonly OptionItem[];
  onChange(value: string): void;
  hint?: string;
  error?: string;
  disabled?: boolean;
  registerRef?: (node: HTMLElement | null) => void;
}): ReactElement {
  const id = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          ref={registerRef}
          id={id}
          size="sm"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          className="w-full"
        >
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
              'max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) origin-(--radix-select-content-transform-origin) overflow-y-auto',
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
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export interface ColumnsStepProps {
  format: 'xlsx' | 'csv';
  fileName: string;
  sheets: readonly string[];
  detectedEncoding: ImportReport['encoding'];
  encoding: TextEncodingName | null;
  table: TableMapping;
  headerRowText: string;
  hoursPerDayText: string;
  preview: TablePreview;
  errors: Partial<Record<ColumnErrorKey, string>>;
  disabled?: boolean;
  onEncodingChange(encoding: TextEncodingName): void;
  onHeaderRowChange(text: string): void;
  onHoursPerDayChange(text: string): void;
  onTableChange(patch: Partial<TableMapping>): void;
  onColumnChange(field: ImportField, column: { index: number; header: string } | null): void;
  registerControl(key: ColumnErrorKey, node: HTMLElement | null): void;
}

/**
 * Step 2 of the stepped import dialog for Excel and CSV files (spec §5.7, §6.4):
 * reading options, column-to-field mapping selects, and a live "First 10 rows" preview.
 */
export function ColumnsStep({
  format,
  fileName,
  sheets,
  detectedEncoding,
  encoding,
  table,
  headerRowText,
  hoursPerDayText,
  preview,
  errors,
  disabled = false,
  onEncodingChange,
  onHeaderRowChange,
  onHoursPerDayChange,
  onTableChange,
  onColumnChange,
  registerControl,
}: ColumnsStepProps): ReactElement {
  const headerRowId = useId();
  const headerRowErrorId = useId();
  const hoursPerDayId = useId();
  const hoursPerDayErrorId = useId();

  // Review Focus 2: empty columns aren't offered as selectable headers.
  const nonEmptyHeaders = preview.headers
    .map((header, index) => ({ index, header }))
    .filter((item) => item.header.trim() !== '');

  const columnOptions: OptionItem[] = [
    { value: NONE_VALUE, label: 'Not used' },
    ...nonEmptyHeaders.map((item) => ({
      value: String(item.index),
      label: `${columnLetter(item.index)} · ${item.header}`,
    })),
  ];

  const mappedIndices = new Set<number>();
  for (const field of IMPORT_FIELD_ORDER) {
    const mapped = table.columns[field];
    if (mapped !== undefined) mappedIndices.add(mapped.index);
  }

  // Columns shown in the preview table: all non-empty header columns, or every column if none has a header.
  const previewColumns =
    nonEmptyHeaders.length > 0
      ? nonEmptyHeaders
      : preview.headers.map((header, index) => ({ index, header }));

  const hasBom = detectedEncoding?.detectedBy === 'bom';
  const currentEncoding = encoding ?? detectedEncoding?.name ?? 'utf-8';

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-sm font-semibold">{`Columns · ${fileName}`}</h3>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {format === 'xlsx' && sheets.length > 0 && (
          <ImportSelect
            label="Sheet"
            value={table.sheet ?? sheets[0]!}
            options={sheets.map((name) => ({ value: name, label: name }))}
            onChange={(sheet) => onTableChange({ sheet })}
            disabled={disabled}
          />
        )}

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={headerRowId} className="text-xs font-semibold">
            Header row
          </Label>
          <Input
            ref={(node) => registerControl('headerRow', node)}
            id={headerRowId}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={headerRowText}
            onChange={(event) => onHeaderRowChange(event.target.value)}
            aria-invalid={errors.headerRow ? true : undefined}
            aria-describedby={errors.headerRow ? headerRowErrorId : undefined}
            readOnly={disabled}
            className="h-8"
          />
          {errors.headerRow && (
            <p id={headerRowErrorId} className="text-xs text-destructive">
              {errors.headerRow}
            </p>
          )}
        </div>

        {format === 'csv' &&
          (hasBom ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold">Text encoding</span>
              <p className="flex h-8 items-center text-sm text-muted-foreground">
                {BOM_ENCODING_LABELS[detectedEncoding.name] ??
                  ENCODING_LABELS[detectedEncoding.name]}
              </p>
            </div>
          ) : (
            <ImportSelect
              label="Text encoding"
              value={currentEncoding}
              options={TEXT_ENCODING_OPTIONS}
              onChange={(value) => onEncodingChange(value as TextEncodingName)}
              hint={
                detectedEncoding !== null
                  ? `Detected: ${ENCODING_LABELS[detectedEncoding.name]}`
                  : undefined
              }
              disabled={disabled}
            />
          ))}

        {format === 'csv' && (
          <ImportSelect
            label="Delimiter"
            value={table.delimiter ?? ','}
            options={DELIMITER_OPTIONS}
            onChange={(value) => onTableChange({ delimiter: value as ',' | ';' | '\t' })}
            disabled={disabled}
          />
        )}

        <ImportSelect
          label="Decimal separator"
          value={table.decimalSeparator}
          options={DECIMAL_OPTIONS}
          onChange={(value) => onTableChange({ decimalSeparator: value as ',' | '.' })}
          disabled={disabled}
        />

        <ImportSelect
          label="Date format"
          value={table.dateFormat}
          options={DATE_FORMAT_OPTIONS}
          onChange={(value) => onTableChange({ dateFormat: value as ImportDateFormat })}
          disabled={disabled}
        />

        <ImportSelect
          label="Duration unit"
          value={table.durationUnit}
          options={DURATION_UNIT_OPTIONS}
          onChange={(value) => onTableChange({ durationUnit: value as 'days' | 'hours' })}
          hint="For durations without a unit"
          disabled={disabled}
        />

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={hoursPerDayId} className="text-xs font-semibold">
            Hours per day
          </Label>
          <Input
            ref={(node) => registerControl('hoursPerDay', node)}
            id={hoursPerDayId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={hoursPerDayText}
            onChange={(event) => onHoursPerDayChange(event.target.value)}
            aria-invalid={errors.hoursPerDay ? true : undefined}
            aria-describedby={errors.hoursPerDay ? hoursPerDayErrorId : undefined}
            readOnly={disabled}
            className="h-8"
          />
          {errors.hoursPerDay && (
            <p id={hoursPerDayErrorId} className="text-xs text-destructive">
              {errors.hoursPerDay}
            </p>
          )}
        </div>

        <ImportSelect
          label="Predecessors refer to"
          value={table.predecessorRef}
          options={PREDECESSOR_REF_OPTIONS}
          onChange={(value) => onTableChange({ predecessorRef: value as 'code' | 'taskId' })}
          disabled={disabled}
        />

        <ImportSelect
          label="Rows with problems"
          value={table.skipRowsWithIssues ? 'skip' : 'keep'}
          options={ROWS_WITH_PROBLEMS_OPTIONS}
          onChange={(value) => onTableChange({ skipRowsWithIssues: value === 'skip' })}
          disabled={disabled}
        />
      </div>

      <section aria-label="Columns" className="flex flex-col gap-3 border-t border-border pt-4">
        <h4 className="text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Columns
        </h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {IMPORT_FIELD_ORDER.map((field) => {
            const mapped = table.columns[field];
            const selected =
              mapped !== undefined && nonEmptyHeaders.some((h) => h.index === mapped.index)
                ? String(mapped.index)
                : NONE_VALUE;
            return (
              <ImportSelect
                key={field}
                label={IMPORT_FIELD_LABELS[field]}
                value={selected}
                options={columnOptions}
                onChange={(value) => {
                  if (value === NONE_VALUE) {
                    onColumnChange(field, null);
                    return;
                  }
                  const index = Number(value);
                  const header = preview.headers[index] ?? '';
                  onColumnChange(field, { index, header });
                }}
                error={errors[field]}
                disabled={disabled}
                registerRef={(node) => registerControl(field, node)}
              />
            );
          })}
        </div>
      </section>

      <section aria-label="Preview" className="flex flex-col gap-2 border-t border-border pt-4">
        <h4 className="text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Preview
        </h4>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full border-collapse text-left text-xs">
            <caption className="sr-only">First 10 rows</caption>
            <thead>
              <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                <th scope="col" className="px-2.5 py-2 font-medium tabular-nums">
                  #
                </th>
                {previewColumns.map((column) => (
                  <th
                    key={column.index}
                    scope="col"
                    className={cn(
                      'px-2.5 py-2 font-medium whitespace-nowrap',
                      mappedIndices.has(column.index) && 'bg-brand-500/10 text-foreground',
                    )}
                  >
                    {column.header.trim() === ''
                      ? columnLetter(column.index)
                      : `${columnLetter(column.index)} · ${column.header}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={previewColumns.length + 1}
                    className="px-3 py-4 text-center text-muted-foreground"
                  >
                    No data rows found below the header row.
                  </td>
                </tr>
              ) : (
                preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="px-2.5 py-1.5 text-muted-foreground tabular-nums">
                      {row.rowNumber}
                    </td>
                    {previewColumns.map((column) => {
                      const cell = row.cells[column.index];
                      return (
                        <td
                          key={column.index}
                          className={cn(
                            'max-w-52 truncate px-2.5 py-1.5 whitespace-nowrap',
                            mappedIndices.has(column.index) && 'bg-brand-500/5',
                            cell?.invalid && 'bg-destructive/10 text-destructive',
                          )}
                          title={cell?.text || undefined}
                        >
                          {cell?.text ?? ''}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
