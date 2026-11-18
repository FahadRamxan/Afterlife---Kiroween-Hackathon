import { fileURLToPath } from 'node:url';
import { configDefaults, defineProject } from 'vitest/config';

/**
 * Per-test time limit. With FC_NUM_RUNS above 100 (ci:local and nightly run 2000 property cases)
 * a property test does 20 times the work, often next to every other project: 60 s. The git hooks
 * run 100 cases and keep Vitest's 5 s.
 */
export const TEST_TIMEOUT = Number(process.env.FC_NUM_RUNS ?? 100) > 100 ? 60_000 : 5_000;

/**
 * Tests that boot real js-dos in headless Chromium. From the root they run in the "emulator"
 * project, after everything else and one file at a time: next to 2,000-case property tests a DOS
 * app is starved of CPU and drops typed keys.
 */
export const EMULATOR_TESTS = ['src/**/*.integration.test.ts', 'src/**/*.stdio.test.ts'];

/** True for a repo-relative test path that the "emulator" project runs. */
export const isEmulatorTest = (file: string) => /\.(integration|stdio)\.test\.ts$/.test(file);

/**
 * Tests on a real Postgres 16 (`freshDatabase()` from @afterlife/db/testing). From the root they
 * run in the "postgres" project, whose globalSetup starts the database once.
 */
export const PG_TESTS = ['src/**/*.pg.test.ts'];

/** True for a repo-relative test path that the "postgres" project runs. */
export const isPgTest = (file: string) => /\.pg\.test\.ts$/.test(file);

/** Starts Postgres 16 in Docker (or uses TEST_DATABASE_URL) for the *.pg.test.ts files. */
export const PG_GLOBAL_SETUP = fileURLToPath(
  new URL('./packages/db/src/testing/global-setup.ts', import.meta.url),
);

/** Set by the root vitest.config.mts before it loads the package configs. */
const FROM_ROOT = process.env.AFTERLIFE_EMULATOR_LAST === '1';

/**
 * Base config for every package and app. Each package's vitest.config.mts re-exports it.
 * From the root, the emulator and Postgres tests are left to their own projects. Run on its own
 * (`pnpm --filter <pkg> test`), a package runs all its tests; `postgres: true` then starts the
 * test database for its *.pg.test.ts files.
 */
export function sharedConfig({ fromRoot, postgres = false }: { fromRoot: boolean; postgres?: boolean }) {
  return defineProject({
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      exclude: [...configDefaults.exclude, ...(fromRoot ? [...EMULATOR_TESTS, ...PG_TESTS] : [])],
      setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
      globalSetup: !fromRoot && postgres ? [PG_GLOBAL_SETUP] : [],
      // passWithNoTests is a root option: vitest.config.mts and each package's `test` script set it.
      testTimeout: TEST_TIMEOUT,
    },
  });
}

/** For a package with *.pg.test.ts files. */
export const sharedPostgresConfig = () => sharedConfig({ fromRoot: FROM_ROOT, postgres: true });

export default sharedConfig({ fromRoot: FROM_ROOT });
