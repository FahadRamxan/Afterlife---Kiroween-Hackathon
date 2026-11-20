// Prompt 58 done when: performing an action then reading back gives the stated effects, and the
// runtime is deterministic. Bills are generated from Shifa's own stock; some are refused (expired,
// more than the stock), which must change nothing.
import { diffTables } from '@afterlife/dbf';
import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createVessel, type ActionInputs } from './runtime';
import { SHIFA, SHIFA_FILES, SHIFA_TODAY, shifaSeed, shifaStore } from './testing/shifa';

const ENTITY = new Map(SHIFA.entities.map((e) => [e.file, e]));
const medicines = shifaSeed('MEDICINE.DBF').records.map((r) => String(r.values.CODE));
const customers = ['', ...shifaSeed('CUSTOMER.DBF').records.map((r) => String(r.values.CUST_ID))];

const bill: fc.Arbitrary<ActionInputs> = fc.record({
  values: fc.record({ CUST_ID: fc.constantFrom(...customers) }),
  lines: fc.array(
    fc.record({
      CODE: fc.constantFrom(...medicines),
      QTY: fc.integer({ min: 0, max: 60 }).map(String),
    }),
    { minLength: 1, maxLength: 5 },
  ),
});

const read = async (store: Awaited<ReturnType<typeof shifaStore>>) =>
  Object.fromEntries(
    await Promise.all(SHIFA_FILES.map(async (f) => [f, await store.records(f)] as const)),
  );

describe('performAction (properties)', () => {
  it('reading back after an action gives exactly the stated effects', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(bill, { minLength: 1, maxLength: 4 }), async (bills) => {
        const store = await shifaStore();
        const v = createVessel(SHIFA, store, { today: () => SHIFA_TODAY });
        for (const inputs of bills) {
          const before = await read(store);
          const r = await v.performAction('save-bill', inputs);
          const after = await read(store);
          for (const f of SHIFA_FILES) {
            const e = ENTITY.get(f)!;
            const d = diffTables(
              { fields: e.fields, records: before[f]! },
              { fields: e.fields, records: after[f]! },
              { key: e.key.length === 1 ? e.key[0]! : null },
            );
            const empty = !d.inserted.length && !d.updated.length && !d.deleted.length;
            if (!r.ok) expect(empty, `${f} changed by a refused bill`).toBe(true);
            else if (r.effects.tables[f]) expect(d).toEqual(r.effects.tables[f]);
            else expect(empty, `${f} changed but is not in the effects`).toBe(true);
          }
        }
      }),
    );
  });

  it('is deterministic: the same bills on the same data give the same effects', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(bill, { minLength: 1, maxLength: 3 }), async (bills) => {
        const runOnce = async () => {
          const v = createVessel(SHIFA, await shifaStore(), { today: () => SHIFA_TODAY });
          const out = [];
          for (const b of bills) out.push(await v.performAction('save-bill', b));
          return out;
        };
        expect(await runOnce()).toEqual(await runOnce());
      }),
    );
  });

  it('money stays exact: whole paisa, and the total is subtotal - discount + GST (invariant)', async () => {
    await fc.assert(
      fc.asyncProperty(bill, async (inputs) => {
        const v = createVessel(SHIFA, await shifaStore(), { today: () => SHIFA_TODAY });
        const r = await v.performAction('save-bill', inputs);
        if (!r.ok) return;
        const b = r.record as Record<string, string>;
        for (const f of ['SUBTOTAL', 'DISCOUNT', 'GST', 'TOTAL'])
          expect(b[f]).toMatch(/^\d+\.\d{2}$/);
        const sum = r.lines.reduce((s, l) => s.plus(String(l.AMOUNT)), new Decimal(0));
        expect(new Decimal(b.SUBTOTAL!).eq(sum)).toBe(true);
        expect(
          new Decimal(b.SUBTOTAL!).minus(b.DISCOUNT!).plus(b.GST!).eq(new Decimal(b.TOTAL!)),
        ).toBe(true);
        // GST is truncated: never more than 17% of what is left after the discount.
        const base = new Decimal(b.SUBTOTAL!).minus(b.DISCOUNT!);
        expect(new Decimal(b.GST!).lte(base.times('0.17'))).toBe(true);
        expect(new Decimal(b.GST!).gt(base.times('0.17').minus('0.01'))).toBe(true);
      }),
    );
  });
});
