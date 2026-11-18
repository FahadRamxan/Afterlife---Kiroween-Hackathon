import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

/**
 * Per-test time limit. With FC_NUM_RUNS above 100 (ci:local and nightly run 2000 property cases)
 * a property test does 20 times the work, often next to every other project: 60 s. The git hooks
 * run 100 cases and keep Vitest's 5 s.
 */
export const TEST_TIMEOUT = Number(process.env.FC_NUM_RUNS ?? 100) > 100 ? 60_000 : 5_000;

/** Base config for every package and app. Each package's vitest.config.mts re-exports it. */
export default defineProject({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
    passWithNoTests: true,
    testTimeout: TEST_TIMEOUT,
  },
});
