import type { ImportReport } from '@/data/types';

// The report's "Download CSV" (P3 core spec §5.9): one row per issue, every cell quoted with `"`
// doubled, and a cell that a spreadsheet would read as a formula — starting with =, +, -, @, a tab
// or a carriage return, or the full-width ＝ ＋ － ＠ — gets a leading apostrophe. Rows end in CRLF.

const HEADER = ['severity', 'code', 'message', 'location', 'original', 'used'] as const;
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;

function cell(value: string | null): string {
  const text = value ?? '';
  const safe = FORMULA_START.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function reportToCsv(report: ImportReport): string {
  const rows = [HEADER.map(cell).join(',')];
  for (const issue of report.issues) {
    rows.push(
      [issue.severity, issue.code, issue.message, issue.location, issue.original, issue.used]
        .map(cell)
        .join(','),
    );
  }
  return rows.join('\r\n');
}

/** The downloads are named after the schedule: "{name} - import report.csv" or ".json". */
export function reportFileName(scheduleName: string, extension: 'csv' | 'json'): string {
  return `${scheduleName} - import report.${extension}`;
}
