// @spec archaeologist-completion#1.2 inferActions on Shifa-like steps.
import type { SnapshotDiff } from '@afterlife/dbf';
import { expandMacro, type Entity } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { inferActions, labelScore, stepFromEvent, type ActionStep } from './actions';

const ENTITIES: Entity[] = SHIFA_REFERENCE_SOUL.entities;
const NONE: SnapshotDiff = { tables: {}, unchanged: [], addedTables: [], removedTables: [] };
const t = (inserted: Record<string, string>[], key: string | null) => ({
  key,
  inserted: inserted.map((values, i) => ({
    key: key ? values[key]! : null,
    recno: 10 + i,
    values,
  })),
  deleted: [],
  updated: [],
  schema: { added: [], removed: [] },
});

/** A bill saved like the Possessor saves one on the real Shifa: the keys, each into its field. */
function bill(lines: { code: string; qty: string; price: string }[], cust = ''): ActionStep[] {
  let n = 0;
  const step = (
    keys: string,
    field: string | null,
    title = 'NEW BILL',
    diff = NONE,
  ): ActionStep => ({
    id: `s${n++}`,
    keys,
    screen: { fingerprint: title === 'MAIN MENU' ? 'fp_menu' : 'fp_bill', title },
    after: { fingerprint: 'fp_bill', title: 'NEW BILL' },
    field,
    dbfDiff: diff,
  });
  const amount = (l: (typeof lines)[number]) => (Number(l.qty) * Number(l.price)).toFixed(2);
  const subtotal = lines.reduce((s, l) => s + Number(amount(l)), 0).toFixed(2);
  const save: SnapshotDiff = {
    tables: {
      'BILLS.DBF': t(
        [
          {
            BILL_NO: '9807-0001',
            BILL_DATE: '19980715',
            CUST_ID: cust,
            SUBTOTAL: subtotal,
            DISCOUNT: '0.00',
            GST: '0.00',
            TOTAL: subtotal,
          },
        ],
        'BILL_NO',
      ),
      'BILLITEM.DBF': t(
        lines.map((l, i) => ({
          BILL_NO: '9807-0001',
          LINE: String(i + 1),
          CODE: l.code,
          QTY: l.qty,
          PRICE: l.price,
          AMOUNT: amount(l),
        })),
        null,
      ),
      'MEDICINE.DBF': {
        key: 'CODE',
        inserted: [],
        deleted: [],
        updated: lines.map((l, i) => ({
          key: l.code,
          beforeRecno: i,
          afterRecno: i,
          changes: [
            { field: 'QTY', before: '100', after: String(100 - Number(l.qty)), delta: `-${l.qty}` },
          ],
        })),
        schema: { added: [], removed: [] },
      },
    },
    unchanged: [],
    addedTables: [],
    removedTables: [],
  };
  return [
    step('1', null, 'MAIN MENU'),
    step(`${cust}{Enter}`, 'Customer ID (blank = walk-in)'),
    ...lines.flatMap((l) => [step(`${l.code}{Enter}`, 'Code'), step(`${l.qty}{Enter}`, 'Qty')]),
    // Enter on the blank Code field ends the lines: not the customer's blank, though both are blank.
    step('{Enter}', 'Code'),
    step('{F2}', null, 'NEW BILL', save),
    step('{Esc}', null),
  ];
}

const reference = SHIFA_REFERENCE_SOUL.actions.find((a) => a.id === 'save-bill')!;

describe('inferActions', () => {
  it('a saved bill gives the reference Soul’s save-bill: its effects and its key macro', () => {
    const [a] = inferActions(
      bill([
        { code: 'PAN500', qty: '4', price: '12.50' },
        { code: 'BRU400', qty: '2', price: '18.75' },
      ]),
      ENTITIES,
    );
    expect({ ...a, screen: undefined }).toEqual({ ...reference, screen: undefined });
    expect(a!.screen).toBe('fp_bill');
  });

  it('the macro typed in again gives the keys that were pressed (round trip)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            code: fc.constantFrom('PAN500', 'BRU400', 'INS100', 'DIS500'),
            qty: fc.integer({ min: 1, max: 99 }).map(String),
            price: fc.constantFrom('12.50', '18.75', '650.00', '6.25'),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        fc.constantFrom('', 'C0002'),
        (lines, cust) => {
          const steps = bill(lines, cust);
          const [a] = inferActions(steps, ENTITIES);
          expect(a!.keys).toBe(reference.keys);
          const pressed = steps
            .slice(1, -1)
            .map((s) => s.keys)
            .join('');
          expect(
            expandMacro(a!.keys, {
              values: { CUST_ID: cust },
              lines: lines.map((l) => ({ CODE: l.code, QTY: l.qty })),
            }),
          ).toBe(pressed);
        },
      ),
    );
  });

  it('steps typed in any order never break it: a macro is kept only when it gives the keys back', () => {
    // A real run types refused codes, edits and later lines out of order (the possession that broke
    // the archaeology step typed a value of line 2 before any of line 1).
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            code: fc.constantFrom('PAN500', 'BRU400', 'INS100'),
            qty: fc.integer({ min: 1, max: 9 }).map(String),
            price: fc.constantFrom('12.50', '18.75', '650.00'),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        fc.func(fc.integer()),
        (lines, order) => {
          const steps = bill(lines);
          const middle = steps.slice(2, -3).sort((x, y) => order(x.id) - order(y.id));
          const shuffled = [...steps.slice(0, 2), ...middle, ...steps.slice(-3)];
          const actions = inferActions(shuffled, ENTITIES);
          expect(actions).toHaveLength(1);
          const a = actions[0]!;
          if (a.keys !== '{F2}') {
            const typed = shuffled
              .slice(1, -1)
              .map((x) => x.keys)
              .join('');
            const values = { CUST_ID: '' };
            const ls = lines.map((l) => ({ CODE: l.code, QTY: l.qty }));
            // The macro starts where the keys can first be explained (its screen): from there on it
            // gives back exactly what was pressed.
            const keys = expandMacro(a.keys, { values, lines: ls });
            expect(keys.length).toBeGreaterThan(0);
            expect(typed.endsWith(keys)).toBe(true);
          }
        },
      ),
    );
  });

  it('a customer added on its list screen is an "add" action, with no lines', () => {
    const add: SnapshotDiff = {
      ...NONE,
      tables: {
        'CUSTOMER.DBF': t(
          [{ CUST_ID: 'C0009', NAME: 'ALI RAZA', PHONE: '051-4567890' }],
          'CUST_ID',
        ),
      },
    };
    const s = (keys: string, field: string | null, diff = NONE): ActionStep => ({
      id: keys,
      keys,
      screen: { fingerprint: 'fp_cust', title: 'CUSTOMERS' },
      after: { fingerprint: 'fp_cust', title: 'CUSTOMERS' },
      field,
      dbfDiff: diff,
    });
    const actions = inferActions(
      [
        s('{PgDn}', null),
        s('A', null),
        s('ALI RAZA{Enter}', 'Name'),
        s('051-4567890{Enter}', 'Phone', add),
      ],
      ENTITIES,
    );
    expect(actions).toEqual([
      {
        id: 'add-customer',
        screen: 'fp_cust',
        name: 'Add a customer',
        keys: '{PgDn}A{@NAME}{Enter}{@PHONE}{Enter}',
        effects: [{ entity: 'customer', kind: 'insert', fields: ['CUST_ID', 'NAME', 'PHONE'] }],
      },
    ]);
  });

  it('of two saves of one kind the shortest macro that explains its keys is kept; effects are their union', () => {
    const first = bill([{ code: 'PAN500', qty: '1', price: '12.50' }]);
    // A second bill with a refused code typed in between: still the same action.
    const second = bill([{ code: 'INS100', qty: '2', price: '650.00' }]);
    second.splice(2, 0, { ...second[2]!, id: 'x', keys: 'ZZZ999{Enter}' });
    const actions = inferActions([...second, ...first], ENTITIES);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.keys).toBe(reference.keys);
  });

  it('steps that write nothing give no action; a save no macro explains keeps its own keys', () => {
    expect(
      inferActions(
        bill([{ code: 'PAN500', qty: '1', price: '12.50' }]).filter(
          (s) => !Object.keys(s.dbfDiff.tables).length,
        ),
        ENTITIES,
      ),
    ).toEqual([]);
    const blind = bill([{ code: 'PAN500', qty: '1', price: '12.50' }]).map((s) => ({
      ...s,
      field: null,
    }));
    expect(inferActions(blind, ENTITIES)[0]).toMatchObject({ id: 'save-bill', keys: '{F2}' });
  });
});

describe('stepFromEvent and labelScore', () => {
  it('reads the field from a recorded event’s label, but not from a guided walk', () => {
    expect(
      stepFromEvent({ keys: 'PAN500{Enter}', label: 'Code = PAN500', from: 'NEW BILL' }).field,
    ).toBe('Code');
    expect(stepFromEvent({ keys: 'PAN500{Enter}', label: 'walk: PAN500{Enter}' }).field).toBeNull();
    expect(stepFromEvent({ keys: '{F2}', label: 'F2=Save bill' }).field).toBeNull();
  });

  it('matches a label to the field it names', () => {
    expect(labelScore('Customer ID (blank = walk-in)', 'CUST_ID')).toBe(2);
    expect(labelScore('Qty', 'QTY')).toBe(1);
    expect(labelScore('Qty', 'LINE')).toBe(0);
    expect(labelScore('Code', 'CUST_ID')).toBe(0);
  });
});
