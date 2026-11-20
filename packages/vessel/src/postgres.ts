// The Vessel's store on the server (Prompt 58): the `vessel_records` table, one project's records.
// The sync queue (Prompt 60) and the Undertaker (Prompt 64) write here; an action is one
// transaction, and its rows are locked while it is checked, so two phones cannot both take the
// same stock.
import type { DbfRecord, DbfValue, SnapshotDiff } from '@afterlife/dbf';
import { and, asc, eq, sql, vesselRecords, type Db } from '@afterlife/db';
import { applyEffects, type EntityStore } from './store';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class PgEntityStore implements EntityStore {
  constructor(
    private readonly db: Db,
    private readonly projectId: string,
  ) {}

  private async read(q: Db | Tx, file: string, lock = false): Promise<DbfRecord[]> {
    const base = q
      .select({
        recno: vesselRecords.recno,
        deleted: vesselRecords.deleted,
        values: vesselRecords.values,
      })
      .from(vesselRecords)
      .where(
        and(
          eq(vesselRecords.projectId, this.projectId),
          eq(vesselRecords.file, file.toUpperCase()),
        ),
      )
      .orderBy(asc(vesselRecords.recno));
    const rows = lock ? await base.for('update') : await base;
    return rows.map((r) => ({ deleted: r.deleted, values: r.values as Record<string, DbfValue> }));
  }

  records(file: string) {
    return this.read(this.db, file);
  }

  async load(file: string, records: DbfRecord[]) {
    const f = file.toUpperCase();
    await this.db.transaction(async (tx) => {
      await tx
        .delete(vesselRecords)
        .where(and(eq(vesselRecords.projectId, this.projectId), eq(vesselRecords.file, f)));
      // In batches: a shop's stock file can have thousands of records.
      for (let i = 0; i < records.length; i += 500)
        await tx.insert(vesselRecords).values(
          records.slice(i, i + 500).map((r, j) => ({
            projectId: this.projectId,
            file: f,
            recno: i + j,
            deleted: r.deleted,
            values: r.values,
          })),
        );
    });
  }

  async commit(effects: SnapshotDiff) {
    await this.db.transaction(async (tx) => {
      const files = Object.keys(effects.tables)
        .map((f) => f.toUpperCase())
        .sort();
      const current: Record<string, DbfRecord[]> = {};
      for (const f of files) current[f] = await this.read(tx, f, true);
      // A ConflictError rolls the transaction back.
      const next = applyEffects(current, effects);
      for (const [file, records] of Object.entries(next)) {
        const was = current[file] ?? [];
        const changed = records
          .map((r, recno) => ({ r, recno }))
          .filter(({ r, recno }) => JSON.stringify(r) !== JSON.stringify(was[recno]));
        if (!changed.length) continue;
        await tx
          .insert(vesselRecords)
          .values(
            changed.map(({ r, recno }) => ({
              projectId: this.projectId,
              file,
              recno,
              deleted: r.deleted,
              values: r.values,
            })),
          )
          .onConflictDoUpdate({
            target: [vesselRecords.projectId, vesselRecords.file, vesselRecords.recno],
            set: {
              deleted: sql`excluded.deleted`,
              values: sql`excluded.values`,
              updatedAt: sql`now()`,
            },
          });
      }
    });
  }

  /** The data files this project has records in. */
  async files(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ file: vesselRecords.file })
      .from(vesselRecords)
      .where(eq(vesselRecords.projectId, this.projectId));
    return rows.map((r) => r.file).sort();
  }
}
