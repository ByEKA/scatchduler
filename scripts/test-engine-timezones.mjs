// Runs the CPM engine unit tests under four time zones (Phase 4 core spec S4).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isMainModule } from './is-main-module.mjs';

export const ENGINE_TIMEZONES = ['UTC', 'America/Los_Angeles', 'Europe/Istanbul', 'Pacific/Auckland'];

function runForTimezone(tz) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', 'src/engine', '--passWithNoTests'],
    {
      stdio: 'inherit',
      env: { ...process.env, TZ: tz },
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isMainModule(import.meta.url)) {
  if (!existsSync(join(process.cwd(), 'src/engine'))) {
    console.log('Engine TZ check: src/engine does not exist yet; skipping.');
    process.exit(0);
  }
  for (const tz of ENGINE_TIMEZONES) {
    console.log(`Running src/engine tests under TZ=${tz}`);
    runForTimezone(tz);
  }
  console.log(`Engine TZ check OK: ${ENGINE_TIMEZONES.length} time zones passed`);
}
