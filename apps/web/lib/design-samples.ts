// Real sample data for /design, read at build time on the server.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { diffTables, readDbf, type DbfRecord, type Table, type TableDiff } from '@afterlife/dbf';

// next build and next dev run from apps/web.
const DIST = path.join(process.cwd(), '..', '..', 'samples', 'graveyard', 'dist');

export function shifaMedicine(): Table {
  const { fields, records } = readDbf(
    new Uint8Array(readFileSync(path.join(DIST, 'shifa', 'MEDICINE.DBF'))),
  );
  return { fields, records };
}

/**
 * The stock file after a day's work: the two stock changes the DOS app really makes in the
 * bill-small scenario (PAN500 240 -> 236, BRU400 180 -> 178), plus the expired AMP500 batch
 * deleted and one new medicine added.
 */
export function shifaStockDiff(): { before: Table; after: Table; diff: TableDiff } {
  const before = shifaMedicine();
  const records: DbfRecord[] = before.records.map((r) => {
    const code = r.values.CODE;
    if (code === 'PAN500') return { ...r, values: { ...r.values, QTY: '236' } };
    if (code === 'BRU400') return { ...r, values: { ...r.values, QTY: '178' } };
    if (code === 'AMP500') return { ...r, deleted: true };
    return r;
  });
  records.push({
    deleted: false,
    values: {
      CODE: 'ZIN020',
      NAME: 'ZINCAT SYRUP 60ML',
      BATCH: 'ZN9807',
      EXPIRY: '20000531',
      PRICE: '42.00',
      QTY: '60',
    },
  });
  const after = { fields: before.fields, records };
  return { before, after, diff: diffTables(before, after) };
}
