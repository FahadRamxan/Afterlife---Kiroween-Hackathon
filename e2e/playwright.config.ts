import { defineConfig, devices } from '@playwright/test';

// BASE_URL set = test a deployed site (prod smoke workflow), so start no local servers.
const remote = process.env.BASE_URL;
const baseURL = remote ?? 'http://localhost:3000';
const apiURL = 'http://localhost:4000';
// A fake microphone, so the séance's voice recording can be tested (Prompt 31).
const chrome = {
  ...devices['Desktop Chrome'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
};

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // Remote runs only execute tests tagged @smoke.
  grep: remote ? /@smoke/ : undefined,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  // A trace only when a test is retried (ci:local retries once). Tracing every test made the first
  // wave of 10 browsers take 20-30 s per page (measured: /graveyard 1 s without tracing), and tests
  // timed out. Locally (no retries), rerun a failing test with --trace on.
  use: { baseURL, trace: 'on-first-retry' },
  // Small tolerance for anti-aliasing. Baselines exist per platform (win32 locally, linux for CI).
  // Dev mode (local runs, the pre-push hook) compiles each route on its first visit, which can take
  // more than 5 s; the production build (CI=1, ci:local) does not.
  expect: {
    timeout: process.env.CI ? 5_000 : 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  // Local runs open every route once first (warmup.setup.ts), so `next dev` does not compile them
  // all at once under 10 workers. A deployed site (BASE_URL) is already built.
  projects: remote
    ? [{ name: 'chromium', use: chrome }]
    : [
        { name: 'warmup', testMatch: 'warmup.setup.ts' },
        {
          name: 'chromium',
          use: chrome,
          dependencies: ['warmup'],
        },
      ],
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
