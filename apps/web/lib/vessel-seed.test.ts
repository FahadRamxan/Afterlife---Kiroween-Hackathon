import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { createVessel } from '@afterlife/vessel';
import { describe, expect, it } from 'vitest';
import { seededStore, tablesFromBundle } from './vessel-seed';

const bundle = new Uint8Array(readFileSync(resolve(__dirname, '../public/graveyard/shifa.jsdos')));

describe('the Vessel seeded from the old app’s bundle', () => {
  it('reads every data file the Soul names out of the js-dos bundle', () => {
    const t = tablesFromBundle(bundle, SHIFA_REFERENCE_SOUL);
    expect(Object.keys(t).sort()).toEqual([
      'BILLITEM.DBF',
      'BILLS.DBF',
      'CUSTOMER.DBF',
      'MEDICINE.DBF',
    ]);
    expect(t['MEDICINE.DBF']!.records).toHaveLength(40);
  });

  it('a bill saved on the shop’s real records gets the next July number', async () => {
    const { store, missing } = await seededStore(bundle, SHIFA_REFERENCE_SOUL);
    expect(missing).toEqual([]);
    const v = createVessel(SHIFA_REFERENCE_SOUL, store, { today: () => '1998-07-15' });
    const r = await v.performAction('save-bill', { lines: [{ CODE: 'PAN500', QTY: '2' }] });
    expect(r.ok && r.record).toMatchObject({ BILL_NO: '9807-0001', GST: '4.25', TOTAL: '29.25' });
  });

  it('says which files the bundle does not have', async () => {
    const soul = {
      ...SHIFA_REFERENCE_SOUL,
      entities: [
        ...SHIFA_REFERENCE_SOUL.entities,
        { ...SHIFA_REFERENCE_SOUL.entities[0]!, id: 'x', file: 'X.DBF' },
      ],
    };
    expect((await seededStore(bundle, soul)).missing).toEqual(['X.DBF']);
  });
});
