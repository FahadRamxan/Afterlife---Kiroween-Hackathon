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

/** Set by the root vitest.config.mts before it loads the package configs. */
const FROM_ROOT = process.env.AFTERLIFE_EMULATOR_LAST === '1';

/** Base config for every package and app. Each package's vitest.config.mts re-exports it. */
export function sharedConfig({ fromRoot }: { fromRoot: boolean }) {
  return defineProject({
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      // Run on its own (`pnpm --filter <pkg> test`), a package still runs its emulator tests.
      exclude: [...configDefaults.exclude, ...(fromRoot ? EMULATOR_TESTS : [])],
      setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
      // passWithNoTests is a root option: vitest.config.mts and each package's `test` script set it.
      testTimeout: TEST_TIMEOUT,
    },
  });
}

export default sharedConfig({ fromRoot: FROM_ROOT });
