// A throwaway Postgres 16 in Docker, for tests and for `pnpm pipeline:record`.
import { execFileSync } from 'node:child_process';
import pg from 'pg';

const IMAGE = 'postgres:16-alpine';

/** Waits until the server takes a login. */
export async function waitForPostgres(url: string, timeoutMs: number) {
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

/** Starts the container and returns the URL of its `postgres` database, and how to stop it. */
export async function startTestPostgres(): Promise<{ url: string; stop(): void }> {
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
      `These tests need Postgres: start Docker, or set TEST_DATABASE_URL. (${(e as Error).message.split('\n')[0]})`,
      { cause: e },
    );
  }
  const stop = () => {
    try {
      docker('rm', '-f', id);
    } catch {
      /* already gone */
    }
  };
  try {
    const port = docker('port', id, '5432/tcp').split('\n')[0]!.split(':').at(-1);
    const url = `postgres://postgres:test@127.0.0.1:${port}/postgres`;
    await waitForPostgres(url, 60_000);
    return { url, stop };
  } catch (e) {
    stop();
    throw e;
  }
}
