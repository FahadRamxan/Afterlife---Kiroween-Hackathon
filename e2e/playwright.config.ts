import { defineConfig, devices } from '@playwright/test';

// BASE_URL set = test a deployed site (prod smoke workflow), so start no local servers.
const remote = process.env.BASE_URL;
const baseURL = remote ?? 'http://localhost:3000';
const apiURL = 'http://localhost:4000';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // Remote runs only execute tests tagged @smoke.
  grep: remote ? /@smoke/ : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  // Small tolerance for anti-aliasing. Baselines exist per platform (win32 locally, linux for CI).
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : [
        {
          command: 'pnpm --filter @afterlife/api start',
          url: `${apiURL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: { PORT: '4000', WEB_ORIGINS: baseURL, LOG_LEVEL: 'warn' },
        },
        {
          // CI tests the production build. Locally, dev mode is faster.
          command: process.env.CI
            ? 'pnpm --filter @afterlife/web build && pnpm --filter @afterlife/web start'
            : 'pnpm --filter @afterlife/web dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: { NEXT_PUBLIC_API_URL: apiURL },
        },
      ],
});
