// Writes <outDir>/third-party-licenses.txt (P3 core spec §3, S10): every production dependency's
// name, version, licence and its licence and NOTICE files, from the tree that
// `npm ls --omit=dev --all --json --long` prints. The Vite build runs it after every build
// (vite.config.ts, `thirdPartyLicenses`), so dist/, dist-e2e/ and dist-supabase/ each ship the file,
// served at /third-party-licenses.txt. `licenseOf`, `collectPackages` and `formatLicenses` are
// exported for scripts/third-party-licenses.test.mjs.
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './is-main-module.mjs';

const LICENSE_FILE = /^(licen[cs]e|notice|copying|third[-_]?party)/i;
const RULE = '='.repeat(64);

/** The licence of a package.json (or an `npm ls --long` node), in its old or new form. */
export function licenseOf(pkg) {
  if (typeof pkg.license === 'string' && pkg.license !== '') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
    return pkg.licenses
      .map((entry) => (typeof entry === 'string' ? entry : entry.type))
      .join(' OR ');
  }
  return 'UNKNOWN';
}

function compareText(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * The packages of an `npm ls --json --long` tree without its root: one entry per name@version,
 * the one with a path winning over a deduplicated reference. Entries without a version are unmet
 * optional peer dependencies (`npm ls` prints them as `{}`); they aren't installed and are skipped.
 */
export function collectPackages(tree) {
  const byKey = new Map();
  const visit = (dependencies) => {
    for (const [key, node] of Object.entries(dependencies ?? {})) {
      if (typeof node.version === 'string' && node.version !== '') {
        const name = node.name ?? key;
        const id = `${name}@${node.version}`;
        const known = byKey.get(id);
        if (known === undefined || (known.path === undefined && node.path !== undefined)) {
          byKey.set(id, { name, version: node.version, license: licenseOf(node), path: node.path });
        }
      }
      visit(node.dependencies);
    }
  };
  visit(tree.dependencies);
  return [...byKey.values()].sort(
    (a, b) =>
      compareText(a.name, b.name) ||
      a.version.localeCompare(b.version, 'en', { numeric: true }) ||
      compareText(a.version, b.version),
  );
}

/** The licence file's text. `readLicenseFiles(dir)` returns `[fileName, text]` pairs. */
export function formatLicenses(packages, readLicenseFiles) {
  const lines = ['Third-party licences', ''];
  for (const pkg of packages) {
    lines.push(RULE, `${pkg.name} ${pkg.version}`, `License: ${pkg.license}`, '');
    const files = pkg.path === undefined ? [] : readLicenseFiles(pkg.path);
    for (const [fileName, text] of files) {
      lines.push(`--- ${fileName} ---`, text.replace(/\r\n?/g, '\n').trimEnd(), '');
    }
  }
  return `${lines.join('\n')}\n`;
}

function readLicenseFilesFrom(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort(compareText)
    .map((name) => [name, readFileSync(join(directory, name), 'utf8')]);
}

function readProductionTree(projectRoot) {
  const command = 'npm ls --omit=dev --all --json --long';
  // Through the shell: on Windows `npm` is `npm.cmd`. npm ls exits non-zero for problems such as
  // an invalid or extraneous package, but its JSON on stdout is still the tree.
  let output;
  try {
    output = execSync(command, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    output = typeof error.stdout === 'string' ? error.stdout : '';
    if (output.trim() === '') throw error;
  }
  return JSON.parse(output);
}

if (isMainModule(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const outDir =
    process.argv[2] === undefined ? join(projectRoot, 'dist') : resolve(process.argv[2]);
  const packages = collectPackages(readProductionTree(projectRoot));
  const outFile = join(outDir, 'third-party-licenses.txt');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, formatLicenses(packages, readLicenseFilesFrom));
  console.log(`Wrote ${packages.length} packages to ${outFile}`);
}
