// @spec learned-certificates#1 Refusal rules without a model.
// @spec learned-certificates#1.1 Line attempts from the observations, and the refusal rules they
// support: a quantity over the stock is refused, found without a model (Prompt 81).
import type { SnapshotDiff } from '@afterlife/dbf';
import type { Entity, Soul } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { inferRefusals, lineAttempts, refusalProbes, type AttemptStep } from './refusals';
const N = (name: string, length = 8, decimals = 0) => ({
  name,
  type: 'N' as const,
  length,
  decimals,
});
const C = (name: string, length = 8) => ({ name, type: 'C' as const, length, decimals: 0 });
const ENTITIES: Entity[] = [
  {
    id: 'bill',
    file: 'BILLS.DBF',
    key: ['BILL_NO'],
    fields: [C('BILL_NO', 9), C('CUST_ID', 5), N('TOTAL', 11, 2)],
    foreignKeys: [],
    counters: [],
  },
  {
    id: 'bill-item',
    file: 'BILLITEM.DBF',
    key: ['BILL_NO', 'LINE'],
    fields: [C('BILL_NO', 9), N('LINE', 2), C('CODE', 6), N('QTY', 5), N('PRICE', 8, 2)],
    foreignKeys: [
      { fields: ['BILL_NO'], references: { entity: 'bill', fields: ['BILL_NO'] } },
      { fields: ['CODE'], references: { entity: 'medicine', fields: ['CODE'] } },
    ],
    counters: [],
  },
  {
    id: 'medicine',
    file: 'MEDICINE.DBF',
    key: ['CODE'],
    fields: [C('CODE', 6), N('PRICE', 8, 2), N('QTY', 5)],
    foreignKeys: [],
    counters: [],
  },
] as unknown as Entity[];
const ACTION = {
  id: 'save-bill',
  name: 'Save a bill',
  screen: 'fp_bill',
  keys: '{@CUST_ID}{Enter}{lines}{#CODE}{Enter}{#QTY}{Enter}{/lines}{Enter}{F2}',
  effects: [
    { kind: 'insert', entity: 'bill', fields: ['BILL_NO', 'CUST_ID', 'TOTAL'] },
    { kind: 'insert', entity: 'bill-item', fields: ['BILL_NO', 'LINE', 'CODE', 'QTY', 'PRICE'] },
    { kind: 'update', entity: 'medicine', fields: ['QTY'] },
  ],
} as unknown as Soul['actions'][number];
const DRAFT = { entities: ENTITIES, actions: [ACTION] };
const TABLES = {
  'MEDICINE.DBF': [
    { values: { CODE: 'PAN500', PRICE: '12.50', QTY: '240' } },
    { values: { CODE: 'INS100', PRICE: '650.00', QTY: '5' } },
  ],
};
/** A screen of the bill form with the cursor on one field, and any messages. */
const screen = (focus: 'Customer' | 'Code' | 'Qty' | null, messages: string[] = []) => ({
  model: {
    fields: ['Customer', 'Code', 'Qty'].map((label, i) => ({
      kind: 'prompt',
      label,
      row: 5 + i,
      col: 10,
      length: null,
      value: '',
      focused: label === focus,
    })),
    messages: messages.map((text, i) => ({ kind: 'error', text, row: 22 + i, col: 1 })),
  },
});
const NONE: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
let n = 0;
const step = (
  keys: string,
  before: ReturnType<typeof screen>,
  after: ReturnType<typeof screen>,
  dbfDiff: SnapshotDiff = NONE,
): AttemptStep => ({ id: `o${++n}`, keys, screenBefore: before, screenAfter: after, dbfDiff });
const NS = { added: [], removed: [] };
const save = (
  bill: string,
  lines: { CODE: string; QTY: string }[],
  stock: Record<string, [string, string]>,
) =>
  step('{F2}', screen(null), screen(null), {
    tables: {
      'BILLS.DBF': {
        key: 'BILL_NO',
        inserted: [{ key: bill, recno: 1, values: { BILL_NO: bill, CUST_ID: '', TOTAL: '1' } }],
        updated: [],
        deleted: [],
        schema: NS,
      },
      'BILLITEM.DBF': {
        key: null,
        inserted: lines.map((l, i) => ({
          key: null,
          recno: i + 1,
          values: { BILL_NO: bill, LINE: String(i + 1), CODE: l.CODE, QTY: l.QTY, PRICE: '1' },
        })),
        updated: [],
        deleted: [],
        schema: NS,
      },
      'MEDICINE.DBF': {
        key: 'CODE',
        inserted: [],
        updated: Object.entries(stock).map(([code, [b, a]]) => ({
          key: code,
          beforeRecno: 1,
          afterRecno: 1,
          changes: [{ field: 'QTY', before: b, after: a, delta: null }],
        })),
        deleted: [],
        schema: NS,
      },
    },
    unchanged: [],
    addedTables: [],
    removedTables: [],
  });
/** 80 of 240 taken, 7 of 5 refused; then 160 of the 160 left taken; then 1 of 0 refused. */
function shop(): AttemptStep[] {
  n = 0;
  return [
    step('{Enter}', screen('Customer'), screen('Code')),
    step('PAN500{Enter}', screen('Code'), screen('Qty')),
    step('80{Enter}', screen('Qty'), screen('Code')),
    step('INS100{Enter}', screen('Code'), screen('Qty')),
    step('7{Enter}', screen('Qty'), screen('Code', ['ONLY 5 IN STOCK'])),
    step('{Enter}', screen('Code', ['ONLY 5 IN STOCK']), screen(null)),
    save('9807-0001', [{ CODE: 'PAN500', QTY: '80' }], { PAN500: ['240', '160'] }),
    step('{Enter}', screen('Customer'), screen('Code')),
    step('PAN500{Enter}', screen('Code'), screen('Qty')),
    step('160{Enter}', screen('Qty'), screen('Code')),
    step('{Enter}', screen('Code'), screen(null)),
    save('9807-0002', [{ CODE: 'PAN500', QTY: '160' }], { PAN500: ['160', '0'] }),
    // The next bill: none left.
    step('PAN500{Enter}', screen('Code'), screen('Qty')),
    step('1{Enter}', screen('Qty'), screen('Code', ['ONLY 0 IN STOCK'])),
    step('{Esc}', screen('Code'), screen(null)),
  ];
}
describe('lineAttempts', () => {
  it('reads each number typed at a line field, its linked record as it was then, and whether it was taken', () => {
    const a = lineAttempts(shop(), DRAFT, TABLES);
    expect(
      a.map((x) => [x.field, x.value, x.linked?.values.QTY, x.accepted, x.observation]),
    ).toEqual([
      ['QTY', '80', '240', true, 'o3'],
      ['QTY', '7', '5', false, 'o5'],
      ['QTY', '160', '160', true, 'o10'],
      ['QTY', '1', '0', false, 'o14'],
    ]);
    expect(a[0]).toMatchObject({
      action: 'save-bill',
      entity: 'bill-item',
      linkedEntity: 'medicine',
    });
  });
  it('reads the field as the real Shifa shows it: an unlabelled box after "Qty:", or no cursor at all', () => {
    // What the screen reader gives on the real app: the Qty box has no label (the text before it
    // reads "Code: PAN500   Qty:"), and the cursor blinks off on some frames.
    const real = (
      fields: { label: string | null; value: string; focused: boolean; col: number }[],
      line: string,
      messages: string[] = [],
    ) => ({
      text: Array.from({ length: 25 }, (_, r) => (r === 21 ? line : '')),
      model: {
        fields: fields.map((f) => ({ ...f, row: 21, kind: 'reverse' })),
        messages: messages.map((text) => ({ text })),
      },
    });
    n = 0;
    const steps = [
      step(
        'PAN500{Enter}',
        real(
          [
            { label: 'Code', value: '', focused: false, col: 7 },
            { label: 'Qty', value: '', focused: false, col: 21 },
          ],
          ' Code:          Qty:',
        ) as never,
        real([], '') as never,
      ),
      step(
        '999{Enter}',
        real(
          [
            { label: 'Code', value: 'PAN500', focused: false, col: 7 },
            { label: null, value: '', focused: true, col: 21 },
          ],
          ' Code: PAN500   Qty:',
        ) as never,
        real([], '', ['ONLY 240 IN STOCK']) as never,
      ),
    ];
    expect(lineAttempts(steps, DRAFT, TABLES).map((a) => [a.field, a.value, a.accepted])).toEqual([
      ['QTY', '999', false],
    ]);
  });
  it('a line left out of the save without a message is not an attempt either way', () => {
    n = 0;
    const steps = [
      step('PAN500{Enter}', screen('Code'), screen('Qty')),
      step('3{Enter}', screen('Qty'), screen('Code')),
      step('{Esc}', screen('Code'), screen(null)),
    ];
    expect(lineAttempts(steps, DRAFT, TABLES)).toEqual([]);
  });
});
describe('inferRefusals', () => {
  it('finds "a quantity larger than the stock is refused", and not one on the price', () => {
    const r = inferRefusals(lineAttempts(shop(), DRAFT, TABLES), DRAFT);
    expect(r.rules.map((x) => x.expression)).toEqual(['bill_item.qty <= medicine.qty']);
    expect(r.rules[0]).toMatchObject({
      kind: 'validate',
      id: 'bill-item-qty-within-medicine-qty',
      evidence: ['o3', 'o5', 'o10', 'o14'],
    });
    expect(r.rules[0]!.en).toBe(
      'A bill item qty larger than the medicine qty is refused when it is typed.',
    );
    expect(r.undecided).toEqual([]);
  });
  it('without a line taken at exactly the stock, <= and < both fit: undecided, to be probed', () => {
    // Only the first bill: 80 of 240 taken, 7 of 5 refused.
    const steps = shop().slice(0, 7);
    const r = inferRefusals(lineAttempts(steps, DRAFT, TABLES), DRAFT);
    expect(r.rules).toEqual([]);
    expect(r.undecided.map((u) => u.expressions)).toEqual([
      ['bill_item.qty <= medicine.qty', 'bill_item.qty < medicine.qty'],
    ]);
  });
  it('nothing refused: no rule', () => {
    const steps = shop().slice(0, 4);
    expect(inferRefusals(lineAttempts(steps, DRAFT, TABLES), DRAFT).rules).toEqual([]);
  });
});
describe('refusalProbes', () => {
  it('asks for a line at exactly the stock and one over it, on a medicine the old app took', () => {
    n = 0;
    const steps = [
      step('PAN500{Enter}', screen('Code'), screen('Qty')),
      step('3{Enter}', screen('Qty'), screen('Code')),
      save('9807-0001', [{ CODE: 'PAN500', QTY: '3' }], { PAN500: ['240', '237'] }),
    ];
    const p = refusalProbes(DRAFT, lineAttempts(steps, DRAFT, TABLES), TABLES);
    expect(p).toEqual([
      {
        actionId: 'save-bill',
        why: 'bill_item.qty against medicine.qty',
        inputs: { values: { CUST_ID: '' }, lines: [{ CODE: 'PAN500', QTY: '240' }] },
      },
      {
        actionId: 'save-bill',
        why: 'bill_item.qty against medicine.qty',
        inputs: { values: { CUST_ID: '' }, lines: [{ CODE: 'PAN500', QTY: '241' }] },
      },
    ]);
  });
  it('nothing to probe once the rule is decided', () => {
    expect(refusalProbes(DRAFT, lineAttempts(shop(), DRAFT, TABLES), TABLES)).toEqual([]);
  });
});
