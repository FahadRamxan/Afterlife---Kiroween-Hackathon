import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Before the package configs load: they leave the real-emulator tests to the "emulator" project.
process.env.AFTERLIFE_EMULATOR_LAST = '1';
const { TEST_TIMEOUT, PG_GLOBAL_SETUP, PG_TEST_TIMEOUT } = await import('./vitest.shared.mts');

const setup = fileURLToPath(new URL('./vitest.setup.ts', import.meta.url));
export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.mts',
      'apps/*/vitest.config.mts',
      {
        test: {
          name: 'repo',
          include: ['tests/**/*.test.ts'],
          setupFiles: [setup],
          testTimeout: TEST_TIMEOUT,
        },
      },
      {
        // A real Postgres 16, started once (Docker, or TEST_DATABASE_URL). Each file gets its own
        // database, so the files can run side by side.
        test: {
          name: 'postgres',
          include: ['packages/*/src/**/*.pg.test.ts', 'apps/*/src/**/*.pg.test.ts'],
          setupFiles: [setup],
          globalSetup: [PG_GLOBAL_SETUP],
          // Real database round trips next to the rest of the suite: a migration up, down and up
          // took over 5 s in the pre-commit run on a loaded machine.
          testTimeout: Math.max(TEST_TIMEOUT, PG_TEST_TIMEOUT),
        },
      },
      {
        // Real js-dos in headless Chromium: after every other project, one file at a time, so no
        // property test or other emulator takes its CPU (a starved DOS app drops typed keys).
        test: {
          name: 'emulator',
          include: [
            'packages/*/src/**/*.integration.test.ts',
            'packages/*/src/**/*.stdio.test.ts',
            'apps/*/src/**/*.integration.test.ts',
            'apps/*/src/**/*.stdio.test.ts',
          ],
          setupFiles: [setup],
          testTimeout: TEST_TIMEOUT,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      // apps/web is covered by Playwright, not Vitest.
      include: ['packages/*/src/**', 'apps/api/src/**', 'apps/worker/src/**'],
      exclude: ['**/*.test.*', '**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
    },
  },
});
