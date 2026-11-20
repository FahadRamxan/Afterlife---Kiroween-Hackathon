import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../packages/soul/src/examples/shifa';
import { diffRows, getObservationCount, getSoul, specZip, textGrid } from './soul-client';

const json = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('getSoul', () => {
  it('returns the latest Soul, "none" when there is none yet, and the reason otherwise', async () => {
    expect(
      await getSoul('https://a', 'p', json(200, { version: 2, soul: SHIFA_REFERENCE_SOUL })),
    ).toMatchObject({
      ok: true,
      version: 2,
    });
    expect(
      await getSoul('https://a', 'p', json(404, { error: 'NO_SOUL', message: 'none' })),
    ).toEqual({
      ok: false,
      reason: 'none',
    });
    expect(
      await getSoul('https://a', 'p', json(200, { version: 1, soul: { nope: true } })),
    ).toMatchObject({
      ok: false,
      reason: 'error',
    });
  });
});

describe('specZip', () => {
  it('zips the Kiro spec files under one folder named after the app', () => {
    const files = unzipSync(specZip(SHIFA_REFERENCE_SOUL));
    expect(Object.keys(files).sort()).toEqual([
      'shifa-kiro-spec/.kiro/specs/shifa-rebirth/design.md',
      'shifa-kiro-spec/.kiro/specs/shifa-rebirth/requirements.md',
      'shifa-kiro-spec/.kiro/specs/shifa-rebirth/tasks.md',
      'shifa-kiro-spec/.kiro/steering/legacy-behaviour.md',
    ]);
    expect(strFromU8(files['shifa-kiro-spec/.kiro/specs/shifa-rebirth/requirements.md']!)).toMatch(
      /^# Requirements/,
    );
  });
});

describe('textGrid', () => {
  it('turns the text the decoder read into a grid for CrtScreen (white on black: colours are not kept)', () => {
    const g = textGrid(['A'.padEnd(80), ...Array.from({ length: 24 }, () => ' '.repeat(80))]);
    expect(g.rows).toBe(25);
    expect(g.cells[0]![0]).toMatchObject({ char: 'A', fg: 7, bg: 0 });
  });
});

describe('diffRows', () => {
  it('lists each changed record with its kind, key and what changed', () => {
    const rows = diffRows({
      tables: {
        'BILLS.DBF': {
          key: 'BILL_NO',
          inserted: [
            { key: '9807-0001', recno: 3, values: { BILL_NO: '9807-0001', TOTAL: '102.37' } },
          ],
          deleted: [],
          updated: [],
          schema: { added: [], removed: [] },
        },
        'MEDICINE.DBF': {
          key: 'CODE',
          inserted: [],
          deleted: [],
          updated: [
            {
              key: 'PAN500',
              beforeRecno: 0,
              afterRecno: 0,
              changes: [{ field: 'QTY', before: '240', after: '238' }],
            },
          ],
          schema: { added: [], removed: [] },
        },
      },
      unchanged: [],
      addedTables: [],
      removedTables: [],
    });
    expect(rows).toEqual([
      {
        table: 'BILLS.DBF',
        kind: 'inserted',
        key: '9807-0001',
        detail: 'BILL_NO 9807-0001, TOTAL 102.37',
      },
      { table: 'MEDICINE.DBF', kind: 'changed', key: 'PAN500', detail: 'QTY 240 → 238' },
    ]);
  });
});

describe('getObservationCount', () => {
  it('is the API’s total, or null when it cannot tell', async () => {
    expect(await getObservationCount('https://a', 'p', json(200, { total: 143 }))).toBe(143);
    expect(await getObservationCount('https://a', 'p', json(200, { total: -1 }))).toBeNull();
    expect(await getObservationCount('https://a', 'p', json(404, {}))).toBeNull();
    const down = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await getObservationCount('https://a', 'p', down)).toBeNull();
  });
});
