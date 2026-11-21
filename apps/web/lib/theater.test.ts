import { buildDiffRows } from '@afterlife/ui';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LiveEvent } from './live';
import { diffCards, theaterGraph, thought, type TheaterObservation } from './theater';

let seq = 0;
const obs = (
  p: Partial<TheaterObservation> & { step: number; newScreen?: boolean },
): LiveEvent => ({
  seq: ++seq,
  type: 'observation',
  at: '2026-11-19T10:00:00.000Z',
  payload: {
    label: 'x',
    keys: 'x',
    kind: 'explore',
    from: 'MAIN MENU',
    to: 'MAIN MENU',
    fromFingerprint: 'fp_menu',
    fingerprint: 'fp_menu',
    newScreen: false,
    changed: [],
    errors: [],
    screens: 1,
    saves: 0,
    ...p,
  },
});

describe('theaterGraph', () => {
  it('a node per screen title in the order found, with its states; an edge per move; the newest screen lit', () => {
    const g = theaterGraph([
      obs({ step: 1, keys: '1', to: 'NEW BILL', fingerprint: 'fp_bill', newScreen: true }),
      // A line typed on the bill: another state of NEW BILL, not another screen (review 51-60).
      obs({
        step: 2,
        keys: 'PAN500{Enter}',
        from: 'NEW BILL',
        fromFingerprint: 'fp_bill',
        to: 'NEW BILL',
        fingerprint: 'fp_bill_line',
        newScreen: true,
      }),
      obs({
        step: 3,
        keys: '{Esc}',
        from: 'NEW BILL',
        fromFingerprint: 'fp_bill_line',
        to: 'MAIN MENU',
      }),
      obs({ step: 4, keys: '2', to: 'STOCK', fingerprint: 'fp_stock', newScreen: true }),
      obs({
        step: 5,
        keys: '{PgDn}',
        from: 'STOCK',
        fromFingerprint: 'fp_stock',
        to: 'STOCK',
        fingerprint: 'fp_stock',
      }),
    ]);
    expect(g.nodes.map((n) => [n.id, n.title, n.order, n.states])).toEqual([
      ['screen:MAIN MENU', 'MAIN MENU', 0, 1],
      ['screen:NEW BILL', 'NEW BILL', 1, 2],
      ['screen:STOCK', 'STOCK', 2, 1],
    ]);
    expect(g.nodes.map((n) => n.current)).toEqual([false, false, true]);
    // A key that stays on its screen is not an edge between screens.
    expect(g.edges.map((e) => [e.source, e.target, e.label])).toEqual([
      ['screen:MAIN MENU', 'screen:NEW BILL', '1'],
      ['screen:NEW BILL', 'screen:MAIN MENU', '{Esc}'],
      ['screen:MAIN MENU', 'screen:STOCK', '2'],
    ]);
  });

  it('every edge joins two nodes, and no node is there twice (invariant)', () => {
    const fp = fc.constantFrom('fp_a', 'fp_b', 'fp_c', 'fp_d');
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fp, fp, fc.constantFrom('1', '2', '{Esc}')), { maxLength: 40 }),
        (moves) => {
          const g = theaterGraph(
            moves.map(([a, b, k], i) =>
              obs({ step: i + 1, keys: k, fromFingerprint: a, fingerprint: b }),
            ),
          );
          const ids = new Set(g.nodes.map((n) => n.id));
          expect(ids.size).toBe(g.nodes.length);
          for (const e of g.edges) {
            expect(ids.has(e.source)).toBe(true);
            expect(ids.has(e.target)).toBe(true);
            expect(e.source).not.toBe(e.target);
          }
        },
      ),
    );
  });
});

describe('theaterGraph, screens by title (review of 51-60, finding 6)', () => {
  it('one node per title, and its states add up to the fingerprints seen (invariant)', () => {
    const fp = fc.constantFrom('fp_a', 'fp_b', 'fp_c', 'fp_d', 'fp_e');
    const title = fc.constantFrom('MAIN MENU', 'NEW BILL', 'STOCK', '');
    fc.assert(
      fc.property(
        fc.record({
          fp_a: title,
          fp_b: title,
          fp_c: title,
          fp_d: title,
          fp_e: title,
        }),
        fc.array(fc.tuple(fp, fp), { minLength: 1, maxLength: 30 }),
        (titles, moves) => {
          const g = theaterGraph(
            moves.map(([a, b], i) =>
              obs({
                step: i + 1,
                fromFingerprint: a,
                from: titles[a],
                fingerprint: b,
                to: titles[b],
              }),
            ),
          );
          const seen = new Set(moves.flat());
          const named = new Set([...seen].map((f) => titles[f].trim() || '(no title)'));
          expect(g.nodes.map((n) => n.title).sort()).toEqual([...named].sort());
          expect(g.nodes.reduce((sum, n) => sum + n.states, 0)).toBe(seen.size);
          expect(g.nodes.filter((n) => n.current)).toHaveLength(1);
        },
      ),
    );
  });
});

describe('thought', () => {
  const p = (x: Partial<TheaterObservation>) =>
    ({
      step: 1,
      label: '',
      keys: '',
      kind: 'explore',
      from: 'MAIN MENU',
      to: 'MAIN MENU',
      changed: [],
      errors: [],
      ...x,
    }) as TheaterObservation;
  it('says what the Possessor did, in one plain line', () => {
    expect(thought(p({ label: '2 Stock', keys: '2', to: 'STOCK' }))).toBe(
      'Opening "Stock" from MAIN MENU.',
    );
    expect(thought(p({ label: 'Code = PAN500', from: 'NEW BILL', to: 'NEW BILL' }))).toBe(
      'Typing PAN500 into Code on NEW BILL.',
    );
    expect(thought(p({ label: 'Qty = 0 (zero)', from: 'NEW BILL', to: 'NEW BILL' }))).toBe(
      'Trying 0 in Qty on NEW BILL, a boundary value (zero).',
    );
    expect(
      thought(
        p({
          label: 'F2=Save bill',
          keys: '{F2}',
          from: 'NEW BILL',
          to: 'NEW BILL',
          changed: ['BILLS.DBF', 'MEDICINE.DBF'],
        }),
      ),
    ).toBe('Pressing F2 to "Save bill" on NEW BILL. Data changed: BILLS.DBF, MEDICINE.DBF.');
    expect(thought(p({ kind: 'back', label: 'Esc', keys: '{Esc}', from: 'STOCK' }))).toBe(
      'Going back from STOCK with Esc.',
    );
    expect(thought(p({ kind: 'walk', label: 'walk: 1', keys: '1', to: 'NEW BILL' }))).toBe(
      'Walking back to NEW BILL, where there is more to try.',
    );
    expect(
      thought(p({ kind: 'guide', label: 'owner pressed 3', keys: '3', to: 'CUSTOMERS' })),
    ).toBe("Following the owner's séance: 3, to CUSTOMERS.");
    expect(
      thought(
        p({
          label: 'Code = ZZZ999 (new-key)',
          from: 'NEW BILL',
          to: 'NEW BILL',
          errors: ['MEDICINE NOT FOUND'],
        }),
      ),
    ).toBe(
      'Trying ZZZ999 in Code on NEW BILL, a boundary value (new-key). The app said: MEDICINE NOT FOUND.',
    );
  });
});

describe('diffCards', () => {
  const diff = {
    tables: {
      'BILLS.DBF': {
        key: 'BILL_NO',
        inserted: [
          { key: '9807-0001', recno: 3, values: { BILL_NO: '9807-0001', TOTAL: '29.25' } },
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
            changes: [{ field: 'QTY', before: '240', after: '238', delta: '-2' }],
          },
        ],
        schema: { added: [], removed: [] },
      },
    },
    unchanged: ['CUSTOMER.DBF'],
    addedTables: [],
    removedTables: [],
  };

  it('a card per changed table, with only the records that changed', () => {
    const cards = diffCards(diff);
    expect(cards.map((c) => c.caption)).toEqual(['BILLS.DBF', 'MEDICINE.DBF']);
    const med = cards[1]!;
    expect(med.before.records.map((r) => r.values)).toEqual([{ CODE: 'PAN500', QTY: '240' }]);
    expect(med.after.records.map((r) => r.values)).toEqual([{ CODE: 'PAN500', QTY: '238' }]);
    expect(med.before.fields.map((f) => [f.name, f.type])).toEqual([
      ['CODE', 'C'],
      ['QTY', 'N'],
    ]);
  });

  it('a phone number or a zero-led code is shown as text, not as a number', () => {
    const [card] = diffCards({
      tables: {
        'CUSTOMER.DBF': {
          key: 'CUST_ID',
          inserted: [
            {
              key: 'C0012',
              recno: 8,
              values: { CUST_ID: 'C0012', PHONE: '999999999999', PIN: '0042' },
            },
          ],
          deleted: [],
          updated: [],
          schema: { added: [], removed: [] },
        },
      },
      unchanged: [],
      addedTables: [],
      removedTables: [],
    });
    expect(card!.after.fields.map((f) => [f.name, f.type])).toEqual([
      ['CUST_ID', 'C'],
      ['PHONE', 'C'],
      ['PIN', 'C'],
    ]);
  });

  it('DbfDiffView shows each insert, delete and change of the diff, no more (invariant)', () => {
    const rec = fc.record({
      K: fc.stringMatching(/^[A-Z]\d{2}$/),
      V: fc.stringMatching(/^\d{1,3}$/),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(rec, { selector: (r) => r.K, maxLength: 12 }),
        fc.nat(4),
        fc.nat(4),
        (rows, nIns, nDel) => {
          const ins = rows.slice(0, nIns);
          const del = rows.slice(nIns, nIns + nDel);
          const upd = rows.slice(nIns + nDel);
          const d = {
            tables: {
              'T.DBF': {
                key: 'K',
                inserted: ins.map((v, i) => ({ key: v.K, recno: 100 + i, values: v })),
                deleted: del.map((v, i) => ({ key: v.K, recno: 200 + i, values: v })),
                updated: upd.map((v, i) => ({
                  key: v.K,
                  beforeRecno: 300 + i,
                  afterRecno: 300 + i,
                  changes: [{ field: 'V', before: v.V, after: `${v.V}0` }],
                })),
                schema: { added: [], removed: [] },
              },
            },
            unchanged: [],
            addedTables: [],
            removedTables: [],
          };
          const [card] = diffCards(d);
          if (!rows.length) {
            expect(card).toBeUndefined();
            return;
          }
          const kinds = buildDiffRows(card!.before, card!.after, card!.diff).map((r) => r.kind);
          expect(kinds.filter((k) => k === 'inserted')).toHaveLength(ins.length);
          expect(kinds.filter((k) => k === 'deleted')).toHaveLength(del.length);
          expect(kinds.filter((k) => k === 'changed')).toHaveLength(upd.length);
        },
      ),
    );
  });
});
