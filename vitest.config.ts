import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Unit tests run in a negative UTC offset so date-only values that get parsed as UTC show up as
// off-by-one-day failures.
process.env.TZ = 'America/Los_Angeles';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
      restoreMocks: true,
    },
  }),
);
