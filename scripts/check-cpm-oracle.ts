// Optional owner-machine CPM oracle check against git-ignored `real-exports/` (spec §8 V4, D2).
// Prints anonymous per-file and aggregate field-match percentages without ever printing file names,
// project names, activity codes or names. Skips cleanly when `real-exports/` is absent.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromImportModel, solve } from '../src/engine/index';
import {
  compareAgainstOracle,
  type OracleField,
  type OracleFieldStats,
} from '../src/engine/oracle';
import { analyze, inspect } from '../src/import/index';

const ORACLE_EXTENSIONS = new Set(['.xer', '.xml']);
const FIELDS: readonly OracleField[] = ['es', 'ef', 'ls', 'lf', 'tf', 'ff'];

function defaultExportsFolder(): string {
  const gitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  return join(dirname(gitDir), 'real-exports');
}

function filesUnder(folder: string): string[] {
  const found: string[] = [];
  const pending = [folder];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) found.push(full);
    }
  }
  const key = (p: string) => relative(folder, p).split('\\').join('/');
  return found.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

function pct(stats: OracleFieldStats): string {
  if (stats.compared === 0) return 'n/a';
  const matched = stats.compared - stats.mismatches;
  return `${((matched / stats.compared) * 100).toFixed(1)}% (${matched}/${stats.compared})`;
}

export async function runOracleCheck(folder: string): Promise<string> {
  let files: string[];
  try {
    files = statSync(folder).isDirectory() ? filesUnder(folder) : [];
  } catch {
    return `CPM oracle check: ${folder} not found; skipping.`;
  }

  const targets = files.filter((p) => ORACLE_EXTENSIONS.has(extname(p).toLowerCase()));
  if (targets.length === 0) {
    return `CPM oracle check: no .xer or .xml files in ${folder}; skipping.`;
  }

  const totals: Record<OracleField, OracleFieldStats> = {
    es: { compared: 0, mismatches: 0, maxAbsDiffMinutes: 0 },
    ef: { compared: 0, mismatches: 0, maxAbsDiffMinutes: 0 },
    ls: { compared: 0, mismatches: 0, maxAbsDiffMinutes: 0 },
    lf: { compared: 0, mismatches: 0, maxAbsDiffMinutes: 0 },
    tf: { compared: 0, mismatches: 0, maxAbsDiffMinutes: 0 },
    ff: { compared: 0, mismatches: 0, maxAbsDiffMinutes: 0 },
  };
  let solvedCount = 0;
  let errorCount = 0;
  const lines: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    const path = targets[i]!;
    const ext = extname(path).toLowerCase();
    const label = `File ${i + 1} (${ext})`;
    const bytes = new Uint8Array(readFileSync(path));
    const inspected = await inspect(bytes, `export${ext}`);
    if (inspected.kind === 'refused') {
      lines.push(`${label}: refused`);
      continue;
    }
    const analyzed = await analyze(bytes, `export${ext}`, inspected.mapping);
    if (analyzed.kind === 'refused') {
      lines.push(`${label}: analyze refused`);
      continue;
    }
    const statusIso = analyzed.model.project.statusDate?.slice(0, 10) ?? null;
    const doc = fromImportModel(analyzed.model, { scheduleStatusDate: statusIso });
    const res = solve(doc, { calculatedAt: new Date().toISOString() });
    if (!res.ok) {
      errorCount += 1;
      lines.push(`${label}: solver error ${res.error.code}`);
      continue;
    }
    solvedCount += 1;
    const report = compareAgainstOracle(doc, res.summary);
    const summaryParts = FIELDS.map((f) => `${f}=${pct(report.fields[f])}`);
    lines.push(
      `${label}: ${report.activities} activities, ${res.summary.durationMs.toFixed(1)} ms | ${summaryParts.join(' | ')}`,
    );
    for (const f of FIELDS) {
      totals[f].compared += report.fields[f].compared;
      totals[f].mismatches += report.fields[f].mismatches;
      if (report.fields[f].maxAbsDiffMinutes > totals[f].maxAbsDiffMinutes) {
        totals[f].maxAbsDiffMinutes = report.fields[f].maxAbsDiffMinutes;
      }
    }
  }

  lines.push('');
  lines.push(
    `Aggregate (${solvedCount} solved, ${errorCount} solver errors): ${FIELDS.map((f) => `${f}=${pct(totals[f])}`).join(' | ')}`,
  );
  return lines.join('\n');
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const folder = process.argv[2] ?? defaultExportsFolder();
  console.log(await runOracleCheck(folder));
}
