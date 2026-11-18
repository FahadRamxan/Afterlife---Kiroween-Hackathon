import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

/**
 * A connection pool and its Drizzle client. Neon's pooled URL works as is (it carries
 * sslmode=require). `max` stays small: Render's starter plans and Neon's free tier have few
 * connections to share between the API and the worker.
 */
export function createDb(
  url: string,
  opts: { max?: number; onIdleError?: (e: Error) => void } = {},
): Db {
  const pool = new pg.Pool({ connectionString: url, max: opts.max ?? 5 });
  // An idle connection can be closed by the server (Neon suspends an idle database, a restart,
  // a failover). The pool drops it and opens a new one on the next query; without a listener the
  // 'error' event would crash the process.
  pool.on('error', (e) => opts.onIdleError?.(e));
  return drizzle(pool, { schema }) as Db;
}
