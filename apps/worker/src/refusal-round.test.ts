// @spec learned-certificates#1.2 The refusal round of the archaeology step (Prompt 81): it reads the
// line attempts, types boundary bills into the old app when they cannot decide, and keeps the
// refusal rules the old app's answers support. A fake Shifa answers here; the real one in the
// recorded runs.
import type { SnapshotDiff } from '@afterlife/dbf';
import type { AttemptStep } from '@afterlife/crew';
import type { Entity, Soul } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { refusalRound } from './refusal-round';
const NS = { added: [], removed: [] };
const ENTITIES = [
  {
    id: 'bill-item',
    file: 'BILLITEM.DBF',
    key: ['BILL_NO', 'LINE'],
    fields: [
      { name: 'BILL_NO', type: 'C', length: 9, decimals: 0 },
      { name: 'CODE', type: 'C', length: 6, decimals: 0 },
      { name: 'QTY', type: 'N', length: 5, decimals: 0 },
    ],
    foreignKeys: [{ fields: ['CODE'], references: { entity: 'medicine', fields: ['CODE'] } }],
    counters: [],
  },
  {
    id: 'medicine',
    file: 'MEDICINE.DBF',
    key: ['CODE'],
    fields: [
      { name: 'CODE', type: 'C', length: 6, decimals: 0 },
      { name: 'QTY', type: 'N', length: 5, decimals: 0 },
    ],
    foreignKeys: [],
    counters: [],
  },
] as unknown as Entity[];
const ACTION = {
  id: 'save-bill',
  name: 'Save a bill',
  screen: 'fp_bill',
  keys: '{lines}{#CODE}{Enter}{#QTY}{Enter}{/lines}{Enter}{F2}',
  effects: [{ kind: 'insert', entity: 'bill-item', fields: ['BILL_NO', 'CODE', 'QTY'] }],
} as unknown as Soul['actions'][number];
const DRAFT = { entities: ENTITIES, actions: [ACTION] };
const TABLES = { 'MEDICINE.DBF': [{ values: { CODE: 'PAN500', QTY: '240' } }] };
const screen = (focus: string | null, messages: string[] = []) => ({
  model: {
    fields: ['Code', 'Qty'].map((label) => ({ label, focused: label === focus })),
    messages: messages.map((text) => ({ text })),
  },
});
const NONE: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
/** A save: the line written, and the stock taken down by it (from what the app booted with). */
const wrote = (code: string, qty: string, stock = 240): SnapshotDiff => ({
  tables: {
    'BILLITEM.DBF': {
      key: null,
      inserted: [{ key: null, recno: 1, values: { BILL_NO: '9807-0001', CODE: code, QTY: qty } }],
      updated: [],
      deleted: [],
      schema: NS,
    },
    'MEDICINE.DBF': {
      key: 'CODE',
      inserted: [],
      updated: [
        {
          key: code,
          beforeRecno: 1,
          afterRecno: 1,
          changes: [
            {
              field: 'QTY',
              before: String(stock),
              after: String(stock - Number(qty)),
              delta: null,
            },
          ],
        },
      ],
      deleted: [],
      schema: NS,
    },
  },
  unchanged: [],
  addedTables: [],
  removedTables: [],
});
/** A fake Shifa freshly booted with 240 PAN500: it refuses a quantity over the stock. */
function fakeShifa() {
  const typed: string[] = [];
  return {
    typed,
    type: async (_a: Soul['actions'][number], inputs: { lines?: Record<string, string>[] }) => {
      const line = inputs.lines![0]!;
      typed.push(`${line.CODE} x ${line.QTY}`);
      const over = Number(line.QTY) > 240;
      return [
        {
          keys: `${line.CODE}{Enter}`,
          screenBefore: screen('Code'),
          screenAfter: screen('Qty'),
          dbfDiff: NONE,
        },
        {
          keys: `${line.QTY}{Enter}`,
          screenBefore: screen('Qty'),
          screenAfter: screen('Code', over ? ['ONLY 240 IN STOCK'] : []),
          dbfDiff: NONE,
        },
        { keys: '{Enter}', screenBefore: screen('Code'), screenAfter: screen(null), dbfDiff: NONE },
        {
          keys: '{F2}',
          screenBefore: screen(null),
          screenAfter: screen(null),
          dbfDiff: over ? NONE : wrote(line.CODE!, line.QTY!),
        },
      ];
    },
  };
}
/** Possession saw one bill of 3 PAN500: nothing refused yet. */
const SEEN: AttemptStep[] = [
  {
    id: 'o1',
    keys: 'PAN500{Enter}',
    screenBefore: screen('Code'),
    screenAfter: screen('Qty'),
    dbfDiff: NONE,
  },
  {
    id: 'o2',
    keys: '3{Enter}',
    screenBefore: screen('Qty'),
    screenAfter: screen('Code'),
    dbfDiff: NONE,
  },
  {
    id: 'o3',
    keys: '{F2}',
    screenBefore: screen(null),
    screenAfter: screen(null),
    dbfDiff: wrote('PAN500', '3'),
  },
];
describe('refusalRound', () => {
  // Possession's bill took 3 of the 240: each probe boots the old app again, with 240.
  it('types a line at the stock and one over it, then keeps "qty <= stock" from the old app’s answers', async () => {
    const shop = fakeShifa();
    let id = 0;
    const kept: string[] = [];
    const r = await refusalRound({
      steps: SEEN,
      draft: DRAFT,
      tables: TABLES,
      type: shop.type,
      store: async () => `p${++id}`,
      log: async (m) => void kept.push(m),
    });
    expect(shop.typed).toEqual(['PAN500 x 240', 'PAN500 x 241']);
    expect(r.rules.map((x) => x.expression)).toEqual(['bill_item.qty <= medicine.qty']);
    expect(r.probed).toBe(2);
    // The evidence names the old app's own steps, the probes' included.
    expect(r.rules[0]!.evidence).toEqual(['o2', 'p2', 'p6']);
    expect(kept.join('\n')).toContain(
      'Refusal probe bill_item.qty against medicine.qty: PAN500 x 241',
    );
  });
  it('no old app to type into: the rules the steps already support, and no probe', async () => {
    const r = await refusalRound({
      steps: SEEN,
      draft: DRAFT,
      tables: TABLES,
      log: async () => {},
    });
    expect(r).toEqual({ rules: [], probed: 0 });
  });
  it('a probe the old app cannot be driven through is said, and the round goes on', async () => {
    const said: string[] = [];
    const r = await refusalRound({
      steps: SEEN,
      draft: DRAFT,
      tables: TABLES,
      type: async () => {
        throw new Error('No key path from fp_a to fp_b');
      },
      store: async () => 'x',
      log: async (m) => void said.push(m),
    });
    expect(r.rules).toEqual([]);
    expect(said.join('\n')).toContain('could not be typed: No key path from fp_a to fp_b');
  });
});
