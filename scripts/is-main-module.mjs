// True when the module at `moduleUrl` (pass `import.meta.url`) is the script Node was started with.
// Compares real paths: on Windows, process.argv[1] and import.meta.url can differ in drive-letter
// case, path separators or symlinked folders, so a plain URL comparison misses the match.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
