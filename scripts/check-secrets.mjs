// Fails when the production bundle in dist/ contains a Supabase secret (P2 spec §9, S5):
// an `sb_secret_` key, a JWT whose payload has `role: service_role`, or the exact value of
// SUPABASE_SECRET_KEY when that variable is set. `npm run check:secrets` runs it after a build;
// `findSecrets` is exported for scripts/check-secrets.test.mjs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from './is-main-module.mjs';

const SCANNED_EXTENSIONS = new Set(['.js', '.css', '.html', '.json', '.map']);
const JWT = /eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]*/g;
// A key is the prefix followed by its value. supabase-js itself contains the bare prefix
// (`key.startsWith("sb_secret_")`), so the prefix alone is not a finding.
const SECRET_KEY = /sb_secret_[\w-]+/;

function isServiceRoleToken(payloadSegment) {
  try {
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    return payload !== null && typeof payload === 'object' && payload.role === 'service_role';
  } catch {
    return false;
  }
}

export function findSecrets(files, options = {}) {
  const { secretValue } = options;
  const findings = [];
  for (const { path, content } of files) {
    if (SECRET_KEY.test(content)) findings.push(`${path}: sb_secret_ key`);
    for (const match of content.matchAll(JWT)) {
      if (isServiceRoleToken(match[1])) {
        findings.push(`${path}: service_role JWT`);
        break;
      }
    }
    if (secretValue && content.includes(secretValue)) {
      findings.push(`${path}: SUPABASE_SECRET_KEY value`);
    }
  }
  return findings;
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return SCANNED_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

if (isMainModule(import.meta.url)) {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const root = join(projectRoot, 'dist');
  if (!existsSync(root)) {
    console.error('dist/ not found; run the build first');
    process.exit(1);
  }
  const files = listFiles(root).map((path) => ({
    path: relative(projectRoot, path).replaceAll('\\', '/'),
    content: readFileSync(path, 'utf8'),
  }));
  const findings = findSecrets(files, { secretValue: process.env.SUPABASE_SECRET_KEY });
  if (findings.length > 0) {
    for (const finding of findings) console.error(finding);
    process.exitCode = 1;
  } else {
    console.log('No secrets found in dist/');
  }
}
