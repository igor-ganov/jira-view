import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, E2E_APP_ENV, MOCK_PORT } from './e2e/env';

/*
 * E2E boots two servers: the mock Jira (deterministic, in-memory) and the
 * app served via `astro preview`, pointed at the mock through env. The
 * build itself happens in global-setup (see that file for why). The mock
 * holds shared mutable state, so tests run serially (workers: 1) and reset
 * the mock in beforeEach. No retries — flakes must be fixed.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `bun run e2e/mock-jira/server.ts`,
      port: MOCK_PORT,
      env: { MOCK_PORT: String(MOCK_PORT) },
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
    {
      command: `bun run e2e/serve.ts`,
      port: APP_PORT,
      env: { ...E2E_APP_ENV, APP_PORT: String(APP_PORT) },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
