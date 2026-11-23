// @spec ghost-twin#1 Capture.
// @spec ghost-twin#1.1 Watching the shop's data folder (Prompt 76): a change in a DBF file is one
// twin event, with its diff and when it happened; nothing changed is no event.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeDbf, type DbfTable } from '@afterlife/dbf';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCapture, type TwinEvent } from './capture';

const MEDICINE: DbfTable = {
  version: 0x03,
  lastUpdate: { year: 1998, month: 7, day: 15 },
  fields: [
    { name: 'CODE', type: 'C', length: 6, decimals: 0 },
    { name: 'QTY', type: 'N', length: 5, decimals: 0 },
  ],
  records: [
    { deleted: false, values: { CODE: 'PAN500', QTY: '240' } },
    { deleted: false, values: { CODE: 'INS100', QTY: '12' } },
  ],
};
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'twin-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const put = (name: string, f: DbfTable) => writeFileSync(path.join(dir, name), writeDbf(f));

describe('createCapture', () => {
  it('the first look is the starting point; a change after it is an event with its diff', async () => {
    put('MEDICINE.DBF', MEDICINE);
    const sent: TwinEvent[] = [];
    const at = new Date('1998-07-15T10:00:00.000Z');
    const c = createCapture({ dir, post: async (e) => void sent.push(e), now: () => at });
    expect(await c.tick()).toBeNull();
    // A sale: PAN500 240 -> 238.
    put('MEDICINE.DBF', {
      ...MEDICINE,
      records: [{ deleted: false, values: { CODE: 'PAN500', QTY: '238' } }, MEDICINE.records[1]!],
    });
    const e = (await c.tick())!;
    expect(e).toMatchObject({
      seq: 1,
      occurredAt: '1998-07-15T10:00:00.000Z',
      files: ['MEDICINE.DBF'],
    });
    expect(e.diff.tables['MEDICINE.DBF']!.updated[0]!.changes).toEqual([
      { field: 'QTY', before: '240', after: '238', delta: '-2' },
    ]);
    expect(sent).toEqual([e]);
    // Nothing changed since: no event.
    expect(await c.tick()).toBeNull();
    // A new file appears: an event that says so.
    put('BILLS.DBF', { ...MEDICINE, records: [] });
    const f = (await c.tick())!;
    expect(f.seq).toBe(2);
    expect(f.diff.addedTables).toEqual(['BILLS.DBF']);
  });

  it('a file caught half written is skipped this time and read on the next look', async () => {
    put('MEDICINE.DBF', MEDICINE);
    const sent: TwinEvent[] = [];
    const c = createCapture({ dir, post: async (e) => void sent.push(e) });
    await c.tick();
    writeFileSync(path.join(dir, 'MEDICINE.DBF'), writeDbf(MEDICINE).slice(0, 40));
    expect(await c.tick()).toBeNull();
    expect(sent).toEqual([]);
    put('MEDICINE.DBF', { ...MEDICINE, records: [MEDICINE.records[0]!] });
    expect((await c.tick())!.diff.tables['MEDICINE.DBF']!.deleted).toHaveLength(1);
  });

  it('an event the API does not take yet is sent again, in order, before newer ones', async () => {
    put('MEDICINE.DBF', MEDICINE);
    const sent: number[] = [];
    let down = true;
    const c = createCapture({
      dir,
      post: async (e) => {
        if (down) throw new Error('API down');
        sent.push(e.seq);
      },
    });
    await c.tick();
    put('MEDICINE.DBF', { ...MEDICINE, records: [MEDICINE.records[0]!] });
    await c.tick();
    expect(c.pending()).toBe(1);
    down = false;
    put('MEDICINE.DBF', MEDICINE);
    await c.tick();
    expect(sent).toEqual([1, 2]);
    expect(c.pending()).toBe(0);
  });
});
