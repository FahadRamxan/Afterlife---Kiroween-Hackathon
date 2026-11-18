import { defineProject, mergeConfig } from 'vitest/config';
import { sharedPostgresConfig } from '../../vitest.shared.mts';

// The integration tests run real js-dos in headless Chromium. Files run one at a time, so their
// emulators do not starve each other of CPU (a starved DOS app drops typed-ahead keys). The
// *.pg.test.ts files need the test database (Postgres 16 in Docker, or TEST_DATABASE_URL).
export default mergeConfig(
  sharedPostgresConfig(),
  defineProject({ test: { fileParallelism: false } }),
);
