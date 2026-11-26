import { utils, write } from 'xlsx';
import type { ImportReport } from '@/data/types';

// The report's "Download Excel" (spec §3 rule 3, §7.2.5, S8, V1): builds a 4-sheet .xlsx workbook
// (Summary, Counts, Checks, Issues). Lives inside `src/import/**` so SheetJS stays isolated in the
// lazy import chunk. Every string starting with a formula prefix receives a leading apostrophe and
// is written as a plain string cell (`t: 's'`).

const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;

export function escapeFormulaText(value: string | null | undefined): string {
  const text = value ?? '';
  return FORMULA_START.test(text) ? `'${text}` : text;
}

export function reportToXlsx(report: ImportReport, scheduleName: string): Uint8Array {
  const book = utils.book_new();

  const formatLabel = report.formatVersion
    ? `${report.format} (${report.formatVersion})`
    : report.format;
  const dateRangeLabel =
    report.dateRange.start !== null && report.dateRange.finish !== null
      ? `${report.dateRange.start} – ${report.dateRange.finish}`
      : '';

  const summaryRows: Array<[string, string | number]> = [
    ['Field', 'Value'],
    ['Schedule', escapeFormulaText(scheduleName)],
    ['File', escapeFormulaText(report.file.name)],
    ['Format', escapeFormulaText(formatLabel)],
    ['Status date', escapeFormulaText(report.statusDate.date ?? '')],
    ['Date range', escapeFormulaText(dateRangeLabel)],
    ['Errors', report.issueTotals.error],
    ['Warnings', report.issueTotals.warning],
    ['Notes', report.issueTotals.info],
  ];

  const countsRows: Array<
    [string, string | number, string | number, string | number, string | number]
  > = [
    ['Entity', 'Read', 'Accepted', 'Adjusted', 'Skipped'],
    ...report.counts.map((c): [string, number, number, number, number] => [
      escapeFormulaText(c.entity),
      c.read,
      c.accepted,
      c.adjusted,
      c.skipped,
    ]),
  ];

  const checksRows: Array<[string, string | number]> = [
    ['Check', 'Findings'],
    ...report.checks.map((c): [string, number] => [escapeFormulaText(c.id), c.findings]),
  ];

  const issuesRows: Array<[string, string, string, string, string, string]> = [
    ['Severity', 'Code', 'Message', 'Location', 'Original', 'Used'],
    ...report.issues.map((issue): [string, string, string, string, string, string] => [
      escapeFormulaText(issue.severity),
      escapeFormulaText(issue.code),
      escapeFormulaText(issue.message),
      escapeFormulaText(issue.location),
      escapeFormulaText(issue.original),
      escapeFormulaText(issue.used),
    ]),
  ];

  utils.book_append_sheet(book, utils.aoa_to_sheet(summaryRows), 'Summary');
  utils.book_append_sheet(book, utils.aoa_to_sheet(countsRows), 'Counts');
  utils.book_append_sheet(book, utils.aoa_to_sheet(checksRows), 'Checks');
  utils.book_append_sheet(book, utils.aoa_to_sheet(issuesRows), 'Issues');

  const out = write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Uint8Array(out);
}
