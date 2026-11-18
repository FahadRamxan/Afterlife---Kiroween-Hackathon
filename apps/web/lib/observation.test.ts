import type { Observation } from '@afterlife/emulator';
import { describe, expect, it } from 'vitest';
import { recordCountChanges, replayVerdict, summarizeObservation } from './observation';

const screen = (name: string | null) =>
  ({
    fingerprint: 'fp_0000000000000000',
    text: [],
    cursor: null,
    model: { title: name ? { name } : null },
  }) as unknown as Observation['screenBefore'];

const obs = (over: Partial<Observation>): Observation => ({
  keys: '{F2}',
  screenBefore: screen('NEW BILL'),
  screenAfter: screen('NEW BILL'),
  dbfDiff: { tables: {}, unchanged: ['BILLS.DBF'], addedTables: [], removedTables: [] },
  durationMs: 412,
  stable: true,
  ...over,
});

describe('summarizeObservation', () => {
  it('says what the keys changed, table by table', () => {
    const s = summarizeObservation(
      obs({
        dbfDiff: {
          tables: {
            'MEDICINE.DBF': {
              key: 'CODE',
              inserted: [],
              deleted: [],
              updated: [
                {
                  key: 'PAN500',
                  beforeRecno: 0,
                  afterRecno: 0,
                  changes: [{ field: 'QTY', before: '240', after: '236', delta: '-4' }],
                },
              ],
              schema: { added: [], removed: [] },
            },
            'BILLS.DBF': {
              key: 'BILL_NO',
              inserted: [{ key: '9807-0001', recno: 3, values: {} }],
              deleted: [],
              updated: [],
              schema: { added: [], removed: [] },
            },
          },
          unchanged: ['CUSTOMER.DBF'],
          addedTables: [],
          removedTables: [],
        },
      }),
    );
    expect(s.tables).toEqual([
      { name: 'BILLS.DBF', inserted: 1, deleted: 0, changed: 0, lines: ['+ 9807-0001'] },
      {
        name: 'MEDICINE.DBF',
        inserted: 0,
        deleted: 0,
        changed: 1,
        lines: ['PAN500 QTY 240 → 236 (-4)'],
      },
    ]);
    expect(s.unchanged).toEqual(['CUSTOMER.DBF']);
  });

  it('names the screens and how long it took', () => {
    const s = summarizeObservation(
      obs({ screenBefore: screen('MAIN MENU'), screenAfter: screen('STOCK') }),
    );
    expect(s).toMatchObject({
      keys: '{F2}',
      from: 'MAIN MENU',
      to: 'STOCK',
      durationMs: 412,
      stable: true,
    });
    expect(summarizeObservation(obs({ screenAfter: screen(null) })).to).toBe('unknown');
  });

  it('a record without a key is named by its record number', () => {
    const s = summarizeObservation(
      obs({
        dbfDiff: {
          tables: {
            'LOG.DBF': {
              key: null,
              inserted: [],
              deleted: [{ key: null, recno: 4, values: {} }],
              updated: [],
              schema: { added: [], removed: [] },
            },
          },
          unchanged: [],
          addedTables: [],
          removedTables: [],
        },
      }),
    );
    expect(s.tables[0]!.lines).toEqual(['- record 5']);
  });
});

describe('replayVerdict', () => {
  it('calls the runs identical only when all of them finished with the same data', () => {
    expect(replayVerdict(['a1', 'a1', 'a1'], 3)).toEqual({
      ok: true,
      text: '3 of 3 runs gave identical data files.',
    });
    expect(replayVerdict(['a1', 'b2', 'a1'], 3)).toEqual({
      ok: false,
      text: 'The runs gave different data files: not repeatable.',
    });
  });

  it('does not say "2 of 2 identical" when the third run failed', () => {
    expect(replayVerdict(['a1', 'a1'], 3)).toEqual({
      ok: false,
      text: 'Only 2 of 3 runs finished.',
    });
    expect(replayVerdict([], 3).ok).toBe(false);
  });

  it('three runs that changed nothing prove nothing (every key could have been lost)', () => {
    expect(replayVerdict(['a1', 'a1', 'a1'], 3, 'a1')).toEqual({
      ok: false,
      text: 'The keys changed no data, so the runs prove nothing.',
    });
    expect(replayVerdict(['b2', 'b2', 'b2'], 3, 'a1').ok).toBe(true);
  });
});

describe('recordCountChanges', () => {
  it('lists the tables whose record count changed, in name order', () => {
    expect(
      recordCountChanges(
        { 'MEDICINE.DBF': 40, 'BILLS.DBF': 3, 'BILLITEM.DBF': 4 },
        { 'MEDICINE.DBF': 40, 'BILLS.DBF': 4, 'BILLITEM.DBF': 5 },
      ),
    ).toEqual(['BILLITEM.DBF: 4 → 5 records', 'BILLS.DBF: 3 → 4 records']);
  });

  it('names a table that appeared or went away, and says one record in the singular', () => {
    expect(recordCountChanges({ 'OLD.DBF': 1 }, { 'NEW.DBF': 0 })).toEqual([
      'NEW.DBF: new, 0 records',
      'OLD.DBF: gone (was 1 record)',
    ]);
    expect(recordCountChanges({ 'A.DBF': 0 }, { 'A.DBF': 1 })).toEqual(['A.DBF: 0 → 1 record']);
  });
});
