// Prompt 19 properties: diff(a, a) is empty; applying diff(a, b) to a gives b; inserts and deletes
// are antisymmetric; and numeric deltas are exact.
import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyDiff, diffTables, liveView, type DbfField, type DbfRecord } from './index';

const FIELDS_KEYED: DbfField[] = [
  { name: 'CODE', type: 'C', length: 4, decimals: 0 },
  { name: 'NAME', type: 'C', length: 6, decimals: 0 },
  { name: 'QTY', type: 'N', length: 5, decimals: 0 },
  { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
];
// Same table without a key-like field: matched by record number.
const FIELDS_PLAIN: DbfField[] = FIELDS_KEYED.map((f) =>
  f.name === 'CODE' ? { ...f, name: 'TAG' } : f,
);

// Built from small pieces: fc.stringMatching is too slow for 2,000 runs.
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
const code = fc
  .tuple(fc.constantFrom(...LETTERS), fc.integer({ min: 0, max: 999 }))
  .map(([l, n]) => l + String(n).padStart(3, '0'));
const name = fc
  .tuple(fc.array(fc.constantFrom(...LETTERS, ' '), { maxLength: 5 }), fc.constantFrom(...LETTERS))
  .map(([rest, last]) => rest.join('') + last);
const qty = fc.integer({ min: -999, max: 9999 }).map(String);
const price = fc
  .integer({ min: -99999, max: 999999 })
  .map((p) => new Decimal(p).div(100).toFixed(2));
const values = (codeValue: fc.Arbitrary<string>) =>
  fc.record({
    code: codeValue,
    name,
    qty: fc.option(qty, { nil: null }),
    price: fc.option(price, { nil: null }),
  });

function row(
  keyed: boolean,
  v: { code: string; name: string; qty: string | null; price: string | null },
  deleted = false,
): DbfRecord {
  return {
    deleted,
    values: { [keyed ? 'CODE' : 'TAG']: v.code, NAME: v.name, QTY: v.qty, PRICE: v.price },
  };
}

/** A table, and a later version made by the edits a DOS app does: update, delete (*), append, pack. */
const pair = fc.boolean().chain((keyed) =>
  fc
    .uniqueArray(code, { minLength: 0, maxLength: 12 })
    .chain((codes) =>
      fc.tuple(
        fc.constant(keyed),
        fc.tuple(...codes.map((c) => values(fc.constant(c)))),
        fc.array(
          fc.record({
            kind: fc.constantFrom('update', 'delete', 'append', 'pack', 'rekey'),
            at: fc.nat(),
            v: values(code),
          }),
          { maxLength: 10 },
        ),
      ),
    )
    .map(([k, rows, ops]) => {
      const fields = k ? FIELDS_KEYED : FIELDS_PLAIN;
      const a = { fields, records: rows.map((v) => row(k, v)) };
      let recs = a.records.map((r) => ({ deleted: r.deleted, values: { ...r.values } }));
      const keyField = k ? 'CODE' : 'TAG';
      const used = new Set(recs.map((r) => r.values[keyField] as string));
      for (const op of ops) {
        const live = recs.map((r, i) => [r, i] as const).filter(([r]) => !r.deleted);
        const target = live.length ? live[op.at % live.length]![1] : -1;
        if (op.kind === 'append' || target < 0) {
          if (used.has(op.v.code)) continue; // keep the key unique
          used.add(op.v.code);
          recs.push(row(k, op.v));
        } else if (op.kind === 'update') {
          const r = recs[target]!;
          recs[target] = {
            deleted: false,
            values: { ...r.values, NAME: op.v.name, QTY: op.v.qty, PRICE: op.v.price },
          };
        } else if (op.kind === 'delete') {
          recs[target] = { ...recs[target]!, deleted: true };
        } else if (op.kind === 'rekey') {
          if (used.has(op.v.code)) continue;
          used.add(op.v.code);
          recs[target] = {
            deleted: false,
            values: { ...recs[target]!.values, [keyField]: op.v.code },
          };
        } else {
          recs = recs.filter((r) => !r.deleted); // dBASE PACK: deleted records go, the rest renumber
        }
      }
      return { a, b: { fields, records: recs } };
    }),
);

describe('diff properties', () => {
  it('property: diff(a, a) is empty', () => {
    fc.assert(
      fc.property(pair, ({ a }) => {
        const d = diffTables(a, a);
        expect([d.inserted, d.deleted, d.updated]).toEqual([[], [], []]);
      }),
    );
  });

  it('property: applying diff(a, b) to a gives b (live records)', () => {
    fc.assert(
      fc.property(pair, ({ a, b }) => {
        const d = diffTables(a, b);
        expect(applyDiff(liveView(a, d.key), d)).toEqual(liveView(b, d.key));
      }),
    );
  });

  it('property: inserts and deletes are antisymmetric, updates swap sides', () => {
    fc.assert(
      fc.property(pair, ({ a, b }) => {
        const ab = diffTables(a, b);
        const ba = diffTables(b, a);
        expect(ba.key).toBe(ab.key);
        const strip = (rs: { key: string | null; recno: number; values: unknown }[]) =>
          rs.map((r) => [r.key, r.recno, r.values]);
        expect(strip(ba.inserted)).toEqual(strip(ab.deleted));
        expect(strip(ba.deleted)).toEqual(strip(ab.inserted));
        expect(
          ba.updated.map((u) => [
            u.key,
            u.afterRecno,
            u.beforeRecno,
            u.changes.map((c) => [c.field, c.after, c.before]),
          ]),
        ).toEqual(
          ab.updated.map((u) => [
            u.key,
            u.beforeRecno,
            u.afterRecno,
            u.changes.map((c) => [c.field, c.before, c.after]),
          ]),
        );
      }),
    );
  });

  it('property: before + delta == after, exactly, for every numeric change', () => {
    fc.assert(
      fc.property(pair, ({ a, b }) => {
        for (const u of diffTables(a, b).updated)
          for (const c of u.changes) {
            if (c.delta === null || c.delta === undefined) continue;
            const dec = c.field === 'PRICE' ? 2 : 0;
            expect(new Decimal(c.before as string).plus(c.delta).toFixed(dec)).toBe(c.after);
          }
      }),
    );
  });
});
