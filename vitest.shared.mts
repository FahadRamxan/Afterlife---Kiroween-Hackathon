import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

/** Base config for every package and app. Each package's vitest.config.mts re-exports it. */
export default defineProject({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
    passWithNoTests: true,
  },
});
