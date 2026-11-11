import { read, SSF, type CellObject, type Range } from 'xlsx';
import { REFUSAL_MESSAGES } from '../detect';
import { checkZip, isOoxmlArchive } from '../zip-guard';
import { isEmptyRow, type TableCell, type TableSource } from './normalize';

// xlsx tables (P3 core spec §5.7, §5.10, §5.11): the zip guard first, and only an archive SheetJS
// reads as OOXML (the reader the guard measures); then SheetJS reads only the chosen sheet (the
// first when none is chosen), dense, without formulas or Date objects, at most 20,051 rows.
// Number cells with a date format become date cells, with a % format percent cells; merged cells
// take the top-left value; hidden rows are read.

const SHEET_ROWS = 20_051;
// Merged ranges fill at most this many cells: a sheet's rows and columns are bounded, but a
// workbook can list any number of overlapping merges.
const MAX_MERGE_CELLS = SHEET_ROWS * 201;

function refused(): { refused: string } {
  return { refused: REFUSAL_MESSAGES.notWorkbook };
}

/**
 * A number format's characters outside quoted text, [brackets], escapes (`\x`) and the
 * padding and fill pairs (`_x`, `*x`): what the format shows of the value.
 */
function shownPart(format: string): string {
  let shown = '';
  for (let i = 0; i < format.length; i += 1) {
    const char = format[i];
    if (char === '"' || char === '[') {
      const close = format.indexOf(char === '"' ? '"' : ']', i + 1);
      i = close < 0 ? format.length : close;
    } else if (char === '\\' || char === '_' || char === '*') {
      i += 1;
    } else {
      shown += char;
    }
  }
  return shown;
}

/** Whether a date format shows a time of day: h, s, AM/PM or A/P outside quotes and brackets (D58). */
function showsTime(format: string): boolean {
  return /[hs]|am\/pm|a\/p/i.test(shownPart(format));
}

function tableCell(cell: CellObject | undefined): TableCell | null {
  if (!cell) return null;
  switch (cell.t) {
    case 'n': {
      if (typeof cell.v !== 'number' || !Number.isFinite(cell.v)) return null;
      const format = typeof cell.z === 'string' ? cell.z : '';
      if (format !== '' && SSF.is_date(format) === true) {
        return showsTime(format)
          ? { kind: 'date', serial: cell.v, showsTime: true }
          : { kind: 'date', serial: cell.v };
      }
      return { kind: 'number', value: cell.v, percent: shownPart(format).includes('%') };
    }
    case 's':
      return typeof cell.v === 'string' && cell.v !== '' ? { kind: 'text', text: cell.v } : null;
    case 'b':
      return { kind: 'text', text: cell.v === true ? 'TRUE' : 'FALSE' };
    case 'e':
      return typeof cell.w === 'string' ? { kind: 'text', text: cell.w } : null;
    default:
      return null;
  }
}

/** Each merged range takes its top-left value, within the rows and columns read. */
function fillMerges(grid: Array<Array<TableCell | null>>, merges: readonly Range[]): void {
  const width = grid.reduce((widest, row) => Math.max(widest, row.length), 0);
  let budget = MAX_MERGE_CELLS;
  for (const { s, e } of merges) {
    const value = grid[s.r]?.[s.c] ?? null;
    if (value === null) continue;
    for (let r = s.r; r <= Math.min(e.r, grid.length - 1); r += 1) {
      const row = grid[r]!;
      for (let c = s.c; c <= Math.min(e.c, width - 1); c += 1) {
        if (budget <= 0) return;
        budget -= 1;
        if (r !== s.r || c !== s.c) row[c] = value;
      }
    }
  }
}

/** The chosen sheet of a workbook, or the workbook refusal (§5.2, §5.10). */
export function xlsxSource(
  bytes: Uint8Array,
  sheet: string | null,
): TableSource | { refused: string } {
  if (!checkZip(bytes) || !isOoxmlArchive(bytes)) return refused();
  try {
    const book = read(bytes, {
      type: 'array',
      dense: true,
      cellFormula: false,
      cellDates: false,
      cellNF: true, // number formats tell date and percent cells apart
      sheets: sheet ?? 0,
      sheetRows: SHEET_ROWS,
    });
    const name = sheet ?? book.SheetNames[0];
    const worksheet = name === undefined ? undefined : book.Sheets[name];
    if (name === undefined || !book.SheetNames.includes(name) || !worksheet) return refused();

    const data = (worksheet['!data'] ?? []) as Array<Array<CellObject | undefined> | undefined>;
    const grid = Array.from(data, (row) => Array.from(row ?? [], tableCell));
    fillMerges(grid, worksheet['!merges'] ?? []);

    const rows: TableSource['rows'] = [];
    const rowNumbers: number[] = [];
    grid.forEach((cells, index) => {
      if (isEmptyRow(cells)) return;
      rows.push(cells);
      rowNumbers.push(index + 1);
    });
    return {
      rows,
      rowNumbers,
      sheets: [...book.SheetNames],
      sheet: name,
      date1904: Boolean(book.Workbook?.WBProps?.date1904),
    };
  } catch {
    return refused();
  }
}
