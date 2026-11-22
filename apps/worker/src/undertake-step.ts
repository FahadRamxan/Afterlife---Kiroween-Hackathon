// The undertake step (Prompts 64 and 65): the Undertaker moves the old app's data into the reborn
// app. It reads every data file the Soul's entities name from the app's bundle, converts each
// record (migrate in @afterlife/crew), and writes the records into the project's Vessel records
// in Postgres, where the phones start from. Records phones have synced sales into are never
// written over: the migration is then only checked. Then it reads the records back and reconciles
// them with the old data: counts, sums, stock value and balances must match exactly.
import { migrate, reconcile } from '@afterlife/crew';
import type { DbfRecord } from '@afterlife/dbf';
import { eq, latestSoulRow, vesselSync, type Db } from '@afterlife/db';
import { SoulSchema, type Soul } from '@afterlife/soul';
import { tablesFromBundle, type EntityStore } from '@afterlife/vessel';
import { PgEntityStore } from '@afterlife/vessel/postgres';
import type { StepContext, StepHandler } from './registry';

export const SYNCED =
  'Phones have synced sales into this project’s records, so the migration was checked, not written over them';

export function undertakeStep(deps: {
  db: Db;
  bundleFor: (p: StepContext['project'], projectId: string) => Promise<Uint8Array | null>;
  /** The old app's records from its bundle (tests give their own). */
  tablesFor?: (bundle: Uint8Array, soul: Soul) => Record<string, { records: DbfRecord[] }>;
  /** Where the Vessel's records go (tests give a broken one). */
  storeFor?: (projectId: string) => EntityStore;
}): StepHandler {
  const tablesFor = deps.tablesFor ?? tablesFromBundle;
  const storeFor = deps.storeFor ?? ((id: string) => new PgEntityStore(deps.db, id));
  return async (ctx) => {
    const row = await latestSoulRow(deps.db, ctx.projectId);
    if (!row) return { status: 'skipped', reason: 'This project has no Soul yet' };
    const soul = SoulSchema.parse(row.ir);
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle)
      return { status: 'skipped', reason: 'There are no data files for this project yet' };
    const old = Object.fromEntries(
      Object.entries(tablesFor(bundle, soul)).map(([f, t]) => [f.toUpperCase(), t.records]),
    );
    const m = migrate(soul, old);
    const [synced] = await deps.db
      .select({ id: vesselSync.id })
      .from(vesselSync)
      .where(eq(vesselSync.projectId, ctx.projectId))
      .limit(1);
    const store = storeFor(ctx.projectId);
    for (const t of m.tables) {
      if (!synced) await store.load(t.file, t.migrated);
      await ctx.emit('migration', {
        file: t.file,
        entity: t.entity,
        crossed: t.migrated.length,
        rejected: t.rejected.length,
        of: t.read - t.deleted,
      });
      await ctx.log(
        `${t.file}: ${t.migrated.length} records crossed, ${
          t.rejected.length ? `${t.rejected.length} rejected` : 'none rejected'
        }${t.deleted ? `, ${t.deleted} deleted left behind` : ''}`,
        t.rejected.length ? 'warn' : 'info',
      );
    }
    for (const r of m.rejected)
      await ctx.log(`${r.file} record ${r.recno}: ${r.reason}. Fix: ${r.fix}`, 'warn');
    if (synced) await ctx.log(SYNCED, 'warn');
    // What the reborn app has now, read back: the records just written, or the migration itself
    // when the phones' records were left as they are.
    const after: Record<string, DbfRecord[]> = {};
    for (const t of m.tables)
      after[t.file.toUpperCase()] = synced
        ? t.migrated
        : (await store.records(t.file)).filter((r) => !r.deleted);
    const rec = reconcile(soul, old, after, m.rejected);
    const output = {
      soulVersion: row.version,
      written: !synced,
      tables: m.tables.map((t) => ({
        file: t.file,
        entity: t.entity,
        read: t.read,
        deleted: t.deleted,
        migrated: t.migrated.length,
        rejected: t.rejected.length,
      })),
      rejected: m.rejected,
      reconciliation: rec,
    };
    if (!rec.matches) {
      const bad = rec.lines
        .filter((l) => !l.ok)
        .map((l) => `${l.table} ${l.total} ${l.before} → ${l.after}`);
      return {
        status: 'failed',
        reason: `The migration does not reconcile: ${bad.slice(0, 5).join('; ')}`,
      };
    }
    await ctx.log(`Reconciled: ${rec.lines.length} totals match exactly`);
    return { status: 'done', output };
  };
}
