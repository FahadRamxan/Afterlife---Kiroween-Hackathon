// The Undertaker's migration (Prompt 64): every data file the Soul's entities name, each live
// record converted (convert.ts) and checked (its key not used by an earlier one), into the
// records the Vessel runs on. Deleted records are left out and counted; a record that cannot be
// converted is rejected, with the reason and a fix.
import type { DbfRecord } from '@afterlife/dbf';
import type { Entity, Soul } from '@afterlife/soul';
import { exportRecord, importRecord } from './convert';

export type Rejected = {
  file: string;
  entity: string;
  /** The record's number in the data file, from 1 as dBASE counts. */
  recno: number;
  field: string;
  reason: string;
  fix: string;
};

export type MigratedTable = {
  file: string;
  entity: string;
  /** Records in the data file, deleted ones included. */
  read: number;
  deleted: number;
  migrated: DbfRecord[];
  rejected: Rejected[];
};

export type Migration = { tables: MigratedTable[]; rejected: Rejected[] };

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

function migrateTable(e: Entity, records: DbfRecord[]): MigratedTable {
  const migrated: DbfRecord[] = [];
  const rejected: Rejected[] = [];
  const keys = new Map<string, number>();
  let deleted = 0;
  records.forEach((r, i) => {
    const recno = i + 1;
    if (r.deleted) {
      deleted++;
      return;
    }
    const at = { file: e.file, entity: e.id, recno };
    const t = importRecord(e, r);
    if (!t.ok) {
      rejected.push({ ...at, field: t.field, reason: t.reason, fix: t.fix });
      return;
    }
    if (e.key.length) {
      const k = e.key.map((f) => str(r.values[f])).join('\u0000');
      const first = keys.get(k);
      if (first !== undefined) {
        const shown = e.key.map((f) => `${f} ${str(r.values[f])}`).join(', ');
        rejected.push({
          ...at,
          field: e.key.join(' + '),
          reason: `${shown} is also record ${first}'s`,
          fix: `Give record ${recno} its own ${e.key.join(' + ')}, or delete one of the two`,
        });
        return;
      }
      keys.set(k, recno);
    }
    migrated.push({ deleted: false, values: exportRecord(e, t.typed) });
  });
  return { file: e.file, entity: e.id, read: records.length, deleted, migrated, rejected };
}

/**
 * The migration of the old app's data files (by DOS name, any case) for a Soul. A file the
 * data does not have is migrated as empty: the reconciliation then shows it.
 */
export function migrate(soul: Soul, tables: Record<string, DbfRecord[]>): Migration {
  const byName = new Map(Object.entries(tables).map(([f, r]) => [f.toUpperCase(), r]));
  const out = soul.entities.map((e) => migrateTable(e, byName.get(e.file.toUpperCase()) ?? []));
  return { tables: out, rejected: out.flatMap((t) => t.rejected) };
}
