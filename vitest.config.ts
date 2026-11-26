import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Unit tests run in a negative UTC offset so date-only values that get parsed as UTC show up as
// off-by-one-day failures. `npm run test:engine:tz` sets ENGINE_TEST_TZ to run the engine suite in
// each of its four zones (P4 core spec S4); test workers inherit the TZ set here.
process.env.TZ = process.env.ENGINE_TEST_TZ ?? 'America/Los_Angeles';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: [
        'src/**/*.test.{ts,tsx}',
        'scripts/**/*.test.mjs',
        'scripts/**/*.test.ts',
        'integration/**/*.test.ts',
        'supabase/functions/**/*.test.ts',
      ],
      restoreMocks: true,
      // The longest user-event tests take 2-4 s in a full run and have hit the 5 s default.
      testTimeout: 10_000,
    },
  }),
);
