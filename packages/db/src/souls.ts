// Storing a new Soul version (Prompt 45), shared by the API (a Soul sent to it) and the worker
// (the Urdu translation, Prompt 46). Versions are numbered per project under a lock, so two
// writers never take the same number; `build` makes the IR and spec once the number is known.
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { souls } from './schema';

export async function insertSoulVersion(
  db: Db,
  projectId: string,
  build: (version: number, parentVersion: number | null) => { ir: unknown; specMarkdown: string },
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`);
    const [last] = await tx
      .select({ v: souls.version })
      .from(souls)
      .where(eq(souls.projectId, projectId))
      .orderBy(desc(souls.version))
      .limit(1);
    const version = (last?.v ?? 0) + 1;
    const { ir, specMarkdown } = build(version, last?.v ?? null);
    await tx.insert(souls).values({ projectId, version, ir, specMarkdown });
    return version;
  });
}

/** The newest version's IR as stored (not parsed: the caller checks it with SoulSchema). */
export async function latestSoulRow(
  db: Db,
  projectId: string,
): Promise<{ version: number; ir: unknown } | null> {
  const [row] = await db
    .select({ version: souls.version, ir: souls.ir })
    .from(souls)
    .where(eq(souls.projectId, projectId))
    .orderBy(desc(souls.version))
    .limit(1);
  return row ?? null;
}
