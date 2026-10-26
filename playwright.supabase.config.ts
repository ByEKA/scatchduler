import { defineConfig, devices } from '@playwright/test';

// End-to-end tests on the local Supabase stack. Before running:
// npm run db:start && npm run db:reset && npm run db:env
export default defineConfig({
  testDir: 'e2e-supabase',
  // The tests share the seeded accounts.
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-supabase' }]],
  // Port 4174 as P2 spec §4.3 says (the Edge Function's allowed origins and the auth redirect
  // URLs list it). Its own build folder keeps dist/ and the mock suite's dist-e2e/ untouched, and a
  // running server is never reused (as in playwright.config.ts).
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  outputDir: 'test-results-supabase',
  projects: [
    {
      name: 'supabase',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command:
      'npm run build -- --mode supabase --outDir dist-supabase && npm run preview -- --outDir dist-supabase --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
