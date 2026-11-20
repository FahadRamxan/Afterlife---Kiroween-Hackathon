import { sharedPostgresConfig } from '../../vitest.shared.mts';
// The *.pg.test.ts files need the test database (Postgres 16 in Docker, or TEST_DATABASE_URL).
export default sharedPostgresConfig();
