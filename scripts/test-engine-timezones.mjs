// Runs the CPM engine unit tests under four time zones (Phase 4 core spec S4). Starts the vitest CLI with this Node binary, so no shell or npx.cmd is needed (Node refuses to spawn .cmd without a shell).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { isMainModule } from './is-main-module.mjs';

export const ENGINE_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'Europe/Istanbul',
  'Pacific/Auckland',
];

const ENGINE_TEST_ARGS = ['run', 'src/engine', '--passWithNoTests'];

export function resolveVitestEntry() {
  const requireFromHere = createRequire(import.meta.url);
  const packageJsonPath = requireFromHere.resolve('vitest/package.json');
  const { bin } = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return join(dirname(packageJsonPath), typeof bin === 'string' ? bin : bin.vitest);
}

export function buildVitestCommand(tz) {
  return {
    command: process.execPath,
    args: [resolveVitestEntry(), ...ENGINE_TEST_ARGS],
    // vitest.config.ts sets TZ for the test workers from ENGINE_TEST_TZ; TZ alone would be overridden.
    options: { stdio: 'inherit', env: { ...process.env, TZ: tz, ENGINE_TEST_TZ: tz } },
  };
}

export function runForTimezone(tz, spawn = spawnSync) {
  const { command, args, options } = buildVitestCommand(tz);
  const result = spawn(command, args, options);
  if (result.error) {
    console.error(
      `Engine TZ check: could not start vitest under TZ=${tz}: ${result.error.message}`,
    );
    return 1;
  }
  if (result.status === null) {
    console.error(`Engine TZ check: vitest under TZ=${tz} was killed by ${result.signal}`);
    return 1;
  }
  return result.status;
}

if (isMainModule(import.meta.url)) {
  if (!existsSync(join(process.cwd(), 'src/engine'))) {
    console.log('Engine TZ check: src/engine does not exist yet; skipping.');
    process.exit(0);
  }
  for (const tz of ENGINE_TIMEZONES) {
    console.log(`Running src/engine tests under TZ=${tz}`);
    const code = runForTimezone(tz);
    if (code !== 0) process.exit(code);
  }
  console.log(`Engine TZ check OK: ${ENGINE_TIMEZONES.length} time zones passed`);
}
