import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

/**
 * A connection pool and its Drizzle client. Neon's pooled URL works as is (it carries
 * sslmode=require). `max` stays small: Render's starter plans and Neon's free tier have few
 * connections to share between the API and the worker.
 */
export function createDb(url: string, opts: { max?: number } = {}): Db {
  const pool = new pg.Pool({ connectionString: url, max: opts.max ?? 5 });
  return drizzle(pool, { schema }) as Db;
}
