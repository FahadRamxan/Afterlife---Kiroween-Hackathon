// Seed data: one project per Graveyard sample app, so a fresh database has something to show.
// Fixed ids make the seed safe to run again (ON CONFLICT DO NOTHING). The apps are the samples
// our team wrote to simulate 1990s software; tests/db-seed.test.ts keeps this list in step with
// the Graveyard catalogue.
import type { Db } from './client';
import { projects } from './schema';

export const SEED_PROJECTS = [
  { id: '0192f5a0-0000-7000-8000-000000000001', name: 'Shifa Medical Store', sourceApp: 'shifa' },
  { id: '0192f5a0-0000-7000-8000-000000000002', name: 'Iqra School Fees', sourceApp: 'iqra' },
  {
    id: '0192f5a0-0000-7000-8000-000000000003',
    name: 'Barkat Kiryana Ledger',
    sourceApp: 'barkat',
  },
] as const;

/** Inserts the seed rows that are missing. Returns how many it inserted. */
export async function seed(db: Db): Promise<number> {
  const rows = await db
    .insert(projects)
    .values(SEED_PROJECTS.map((p) => ({ ...p, source: 'graveyard' as const })))
    .onConflictDoNothing({ target: projects.id })
    .returning({ id: projects.id });
  return rows.length;
}
