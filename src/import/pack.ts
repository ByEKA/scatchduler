import { gzipSync } from 'fflate';
import type { ImportIssue, ImportReport } from '@/data/types';

// The stored copy and the stored report (P3 core spec §5.1 step 6, §5.10, D17, D32). XER, MSPDI
// and CSV originals are stored gzipped (mtime 0, so the same bytes always give the same copy); an
// xlsx is already compressed and is stored as it is. The stored report keeps the first 500
// issues, then drops notes and then warnings from the end until it is at most 200 KB as UTF-8
// JSON; its totals stay exact. A report with errors is never stored.

export interface PackResult {
  stored: Uint8Array;
  report: ImportReport;
}

const STORED_ISSUES = 500;
const MAX_REPORT_BYTES = 204_800;

const encoder = new TextEncoder();
function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** The report with as few issues dropped as it takes to fit in MAX_REPORT_BYTES. */
function storedReport(report: ImportReport): ImportReport {
  const issues = report.issues.slice(0, STORED_ISSUES);
  // The JSON is the report without issues plus each issue and the commas between them.
  const sizes = issues.map((issue) => byteLength(JSON.stringify(issue)));
  let total =
    byteLength(JSON.stringify({ ...report, issues: [] })) +
    sizes.reduce((sum, size) => sum + size, 0) +
    Math.max(0, issues.length - 1);
  const keep = issues.map(() => true);
  for (const severity of ['info', 'warning'] as const) {
    for (let i = issues.length - 1; i >= 0 && total > MAX_REPORT_BYTES; i -= 1) {
      if (!keep[i] || issues[i]!.severity !== severity) continue;
      keep[i] = false;
      total -= sizes[i]! + 1;
    }
  }
  const kept: ImportIssue[] = issues.filter((_, i) => keep[i]);
  let stored: ImportReport = { ...report, issues: kept };
  // The estimate is exact for JSON.stringify; this loop only guards it.
  while (kept.length > 0 && byteLength(JSON.stringify(stored)) > MAX_REPORT_BYTES) {
    kept.pop();
    stored = { ...report, issues: kept };
  }
  return stored;
}

export async function pack(
  bytes: Uint8Array,
  fileName: string,
  report: ImportReport,
): Promise<PackResult> {
  if (report.issueTotals.error > 0 || report.issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`${fileName} has errors, so it can't be imported.`);
  }
  const stored = report.format === 'xlsx' ? bytes.slice() : gzipSync(bytes, { mtime: 0 });
  return { stored, report: storedReport(report) };
}
