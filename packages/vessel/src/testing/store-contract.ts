// What every EntityStore must do (memory, IndexedDB, Postgres): the same tests run on each.
import type { DbfRecord } from '@afterlife/dbf';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { createVessel } from '../runtime';
import { ConflictError, type EntityStore } from '../store';
import { SHIFA, SHIFA_FILES, SHIFA_TODAY, shifaSeed } from './shifa';

export function storeContract(make: () => Promise<EntityStore>) {
  it('keeps the records it is given, in record order, deleted ones too', async () => {
    const s = await make();
    const records: DbfRecord[] = [
      { deleted: false, values: { CODE: 'A', QTY: '1' } },
      { deleted: true, values: { CODE: 'B', QTY: null } },
    ];
    await s.load('X.DBF', records);
    expect(await s.records('X.DBF')).toEqual(records);
    expect(await s.records('NONE.DBF')).toEqual([]);
    await s.load('X.DBF', [records[0]!]);
    expect(await s.records('X.DBF')).toEqual([records[0]]);
  });

  it('a bill saved through the Vessel reads back the same, and a stale commit changes nothing', async () => {
    const s = await make();
    for (const f of SHIFA_FILES) await s.load(f, shifaSeed(f).records);
    const v = createVessel(SHIFA, s, { today: () => SHIFA_TODAY });
    const r = await v.performAction('save-bill', {
      values: { CUST_ID: 'C0002' },
      lines: [{ CODE: 'INS100', QTY: '8' }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.refused));
    const bills = await s.records('BILLS.DBF');
    expect(bills.at(-1)!.values).toEqual(r.record);
    const meds = await s.records('MEDICINE.DBF');
    expect(meds.find((m) => m.values.CODE === 'INS100')!.values.QTY).toBe('4');
    const after = await Promise.all(SHIFA_FILES.map((f) => s.records(f)));
    await expect(s.commit(r.effects)).rejects.toBeInstanceOf(ConflictError);
    expect(await Promise.all(SHIFA_FILES.map((f) => s.records(f)))).toEqual(after);
  });

  it('records read back as they were loaded, whatever they hold (round trip)', async () => {
    const s = await make();
    // What a DBF holds: text without NUL (Postgres JSONB refuses it), numbers as text, yes/no.
    const value = fc.oneof(fc.constant(null), fc.boolean(), fc.stringMatching(/^[ -~]{0,12}$/));
    const record = fc.record({
      deleted: fc.boolean(),
      values: fc.dictionary(fc.constantFrom('A', 'B', 'C'), value, { noNullPrototype: true }),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(record, { maxLength: 8 }), async (records) => {
        await s.load('RT.DBF', records);
        expect(await s.records('RT.DBF')).toEqual(records);
      }),
      { numRuns: 25 },
    );
  });
}
