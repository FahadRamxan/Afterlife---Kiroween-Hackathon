// The undertake step (Prompt 64): the Undertaker moves the old app's data into the reborn app. It
// reads every data file the Soul's entities name from the app's bundle, converts each record
// (migrate in @afterlife/crew), and writes the records into the project's Vessel records in
// Postgres, where the phones start from. Records phones have synced sales into are never written
// over: the migration is then only checked.
import { migrate } from '@afterlife/crew';
import type { DbfRecord } from '@afterlife/dbf';
import { eq, latestSoulRow, vesselSync, type Db } from '@afterlife/db';
import { SoulSchema, type Soul } from '@afterlife/soul';
import { tablesFromBundle } from '@afterlife/vessel';
import { PgEntityStore } from '@afterlife/vessel/postgres';
import type { StepContext, StepHandler } from './registry';

export const SYNCED =
  'Phones have synced sales into this project’s records, so the migration was checked, not written over them';

export function undertakeStep(deps: {
  db: Db;
  bundleFor: (p: StepContext['project'], projectId: string) => Promise<Uint8Array | null>;
  /** The old app's records from its bundle (tests give their own). */
  tablesFor?: (bundle: Uint8Array, soul: Soul) => Record<string, { records: DbfRecord[] }>;
}): StepHandler {
  const tablesFor = deps.tablesFor ?? tablesFromBundle;
  return async (ctx) => {
    const row = await latestSoulRow(deps.db, ctx.projectId);
    if (!row) return { status: 'skipped', reason: 'This project has no Soul yet' };
    const soul = SoulSchema.parse(row.ir);
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle)
      return { status: 'skipped', reason: 'There are no data files for this project yet' };
    const old = Object.fromEntries(
      Object.entries(tablesFor(bundle, soul)).map(([f, t]) => [f, t.records]),
    );
    const m = migrate(soul, old);
    for (const t of m.tables)
      await ctx.log(
        `${t.file}: ${t.migrated.length} records crossed, ${
          t.rejected.length ? `${t.rejected.length} rejected` : 'none rejected'
        }${t.deleted ? `, ${t.deleted} deleted left behind` : ''}`,
        t.rejected.length ? 'warn' : 'info',
      );
    for (const r of m.rejected)
      await ctx.log(`${r.file} record ${r.recno}: ${r.reason}. Fix: ${r.fix}`, 'warn');
    const [synced] = await deps.db
      .select({ id: vesselSync.id })
      .from(vesselSync)
      .where(eq(vesselSync.projectId, ctx.projectId))
      .limit(1);
    const store = new PgEntityStore(deps.db, ctx.projectId);
    if (!synced) for (const t of m.tables) await store.load(t.file, t.migrated);
    else await ctx.log(SYNCED, 'warn');
    return {
      status: 'done',
      output: {
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
      },
    };
  };
}
