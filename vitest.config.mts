import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const setup = fileURLToPath(new URL('./vitest.setup.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.mts',
      'apps/*/vitest.config.mts',
      { test: { name: 'repo', include: ['tests/**/*.test.ts'], setupFiles: [setup] } },
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
