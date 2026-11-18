// Vitest globalSetup for the *.pg.test.ts files: a throwaway Postgres 16 in Docker, or the server
// in TEST_DATABASE_URL (a URL to a database the tests may create databases from). Without either
// the tests fail and say so: they are never skipped.
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

const IMAGE = 'postgres:16-alpine';

async function ready(url: string, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    const c = new pg.Client({ connectionString: url });
    try {
      await c.connect();
      await c.query('SELECT 1');
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      await c.end().catch(() => {});
    }
  }
  throw new Error(`Postgres at ${new URL(url).host} did not answer: ${(last as Error)?.message}`);
}

export default async function setup(project: TestProject) {
  const given = process.env.TEST_DATABASE_URL;
  if (given) {
    await ready(given, 10_000);
    project.provide('pgAdminUrl', given);
    return;
  }
  const docker = (...args: string[]) =>
    execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  let id: string;
  try {
    // fsync off: a test database need not survive a power cut, and it is much faster.
    id = docker(
      'run',
      '-d',
      '--rm',
      '--label',
      'afterlife-test=1',
      '-e',
      'POSTGRES_PASSWORD=test',
      '-p',
      '127.0.0.1::5432',
      IMAGE,
      '-c',
      'fsync=off',
      '-c',
      'synchronous_commit=off',
      '-c',
      'full_page_writes=off',
    );
  } catch (e) {
    throw new Error(
      `The *.pg.test.ts tests need Postgres: start Docker, or set TEST_DATABASE_URL. (${(e as Error).message.split('\n')[0]})`,
      { cause: e },
    );
  }
  try {
    const port = docker('port', id, '5432/tcp').split('\n')[0]!.split(':').at(-1);
    const url = `postgres://postgres:test@127.0.0.1:${port}/postgres`;
    await ready(url, 60_000);
    project.provide('pgAdminUrl', url);
  } catch (e) {
    docker('rm', '-f', id);
    throw e;
  }
  return () => {
    docker('rm', '-f', id);
  };
}
