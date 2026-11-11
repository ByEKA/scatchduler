import Papa from 'papaparse';
import { isEmptyRow, type TableCell, type TableSource } from './normalize';

// CSV tables (P3 core spec §5.7): Papa Parse on the decoded text with the chosen or detected
// delimiter. CRLF, LF and a trailing blank line read alike; a byte-order mark never becomes part
// of the first header; rows of only empty cells are dropped (Review Focus 1, 2).

type Delimiter = ',' | ';' | '\t';

const CANDIDATES: readonly Delimiter[] = [',', ';', '\t'];
// The delimiter is guessed from the first rows.
const SAMPLE_ROWS = 200;

function parse(text: string, delimiter: Delimiter, preview = 0): string[][] {
  return Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimiter,
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    preview,
  }).data;
}

/**
 * The candidate giving the most rows with a constant field count: for each, the number of rows
 * sharing the most common count of at least two fields. Ties go to more fields, then to the order
 * ',', ';', tab.
 */
export function guessDelimiter(text: string): Delimiter {
  let best = { delimiter: CANDIDATES[0]!, rows: 0, fields: 0 };
  for (const delimiter of CANDIDATES) {
    const tally = new Map<number, number>();
    for (const fields of parse(text, delimiter, SAMPLE_ROWS)) {
      if (fields.length >= 2) tally.set(fields.length, (tally.get(fields.length) ?? 0) + 1);
    }
    for (const [fields, rows] of tally) {
      if (rows > best.rows || (rows === best.rows && fields > best.fields)) {
        best = { delimiter, rows, fields };
      }
    }
  }
  return best.delimiter;
}

const LINE_BREAK = /\r\n|\r|\n/g;

/** The table of a decoded CSV text; each row keeps the line it starts on (quoted fields may span lines). */
export function csvSource(text: string, delimiter: Delimiter): TableSource {
  const rows: TableSource['rows'] = [];
  const rowNumbers: number[] = [];
  let line = 1;
  for (const fields of parse(text, delimiter)) {
    const cells = fields.map((field): TableCell | null =>
      field === '' ? null : { kind: 'text', text: field },
    );
    if (!isEmptyRow(cells)) {
      rows.push(cells);
      rowNumbers.push(line);
    }
    line += 1;
    for (const field of fields) line += field.match(LINE_BREAK)?.length ?? 0;
  }
  return { rows, rowNumbers, sheets: [], sheet: null, date1904: false };
}
