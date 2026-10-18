import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// Integration tests run in Node against the local Supabase stack (`npm run db:start`).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['integration/**/*.itest.ts'],
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
