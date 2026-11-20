// The Vessel's store on the phone (Prompt 58): IndexedDB through Dexie, one database per project.
// The offline PWA (Prompt 60) keeps the shop's records here; every action is one transaction.
import type { DbfRecord, SnapshotDiff } from '@afterlife/dbf';
import Dexie, { type Table } from 'dexie';
import { applyEffects, type EntityStore } from './store';

type Row = { file: string; recno: number; deleted: boolean; values: DbfRecord['values'] };

/** Dexie's options: tests may pass their own IndexedDB (`indexedDB`, `IDBKeyRange`). */
export type IndexedDbOptions = NonNullable<ConstructorParameters<typeof Dexie>[1]>;

class VesselDb extends Dexie {
  records!: Table<Row, [string, number]>;
  constructor(name: string, opts?: IndexedDbOptions) {
    super(name, opts);
    this.version(1).stores({ records: '[file+recno], file' });
  }
}

export class IndexedDbEntityStore implements EntityStore {
  private readonly db: VesselDb;

  /** `name`: one database per project ("afterlife-vessel-<projectId>"). */
  constructor(name: string, opts?: IndexedDbOptions) {
    this.db = new VesselDb(name, opts);
  }

  private async read(file: string): Promise<DbfRecord[]> {
    const rows = await this.db.records.where('file').equals(file.toUpperCase()).sortBy('recno');
    return rows.map((r) => ({ deleted: r.deleted, values: { ...r.values } }));
  }

  records(file: string) {
    return this.read(file);
  }

  async load(file: string, records: DbfRecord[]) {
    const f = file.toUpperCase();
    await this.db.transaction('rw', this.db.records, async () => {
      await this.db.records.where('file').equals(f).delete();
      await this.db.records.bulkPut(
        records.map((r, recno) => ({ file: f, recno, deleted: r.deleted, values: r.values })),
      );
    });
  }

  async commit(effects: SnapshotDiff) {
    await this.db.transaction('rw', this.db.records, async () => {
      const files = Object.keys(effects.tables).map((f) => f.toUpperCase());
      const current = Object.fromEntries(
        await Promise.all(files.map(async (f) => [f, await this.read(f)] as const)),
      );
      // A ConflictError here aborts the transaction: nothing is written.
      const next = applyEffects(current, effects);
      for (const [file, records] of Object.entries(next)) {
        const was = current[file] ?? [];
        const changed = records
          .map((r, recno) => ({ r, recno }))
          .filter(({ r, recno }) => JSON.stringify(r) !== JSON.stringify(was[recno]));
        await this.db.records.bulkPut(
          changed.map(({ r, recno }) => ({ file, recno, deleted: r.deleted, values: r.values })),
        );
      }
    });
  }

  /** Closes the database (and deletes it with `drop`, for tests). */
  async close(opts: { drop?: boolean } = {}) {
    if (opts.drop) await this.db.delete();
    else this.db.close();
  }
}
