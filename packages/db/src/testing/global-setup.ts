// Vitest globalSetup for the tests on a real Postgres: a throwaway Postgres 16 in Docker, or the
// server in TEST_DATABASE_URL (a URL to a database the tests may create databases from). Without
// either the tests fail and say so: they are never skipped.
import type { TestProject } from 'vitest/node';
import { startTestPostgres, waitForPostgres } from './postgres';

export default async function setup(project: TestProject) {
  const given = process.env.TEST_DATABASE_URL;
  if (given) {
    await waitForPostgres(given, 10_000);
    project.provide('pgAdminUrl', given);
    return;
  }
  const pg = await startTestPostgres();
  project.provide('pgAdminUrl', pg.url);
  return () => pg.stop();
}
