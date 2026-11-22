// @spec surgeon#1 The Surgeon: validate, compile, configure, smoke-test, publish (Prompt 63).
import type { Soul } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { MemoryEntityStore } from '@afterlife/vessel';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { readCsv } from '../archaeologist/testing/graveyard-runs';
import { operate } from './surgeon';

const SOUL = SHIFA_REFERENCE_SOUL;
const TODAY = '1998-07-15';
const records: Record<string, ReturnType<typeof readCsv>['records']> = {};
beforeAll(() => {
  for (const f of ['MEDICINE', 'CUSTOMER', 'BILLS', 'BILLITEM'])
    records[`${f}.DBF`] = readCsv(`shifa/seed/${f}.csv`).records;
});
async function store() {
  const s = new MemoryEntityStore();
  for (const [f, r] of Object.entries(records)) await s.load(f, r);
  return s;
}
const run = async (soul: unknown = SOUL) =>
  operate(soul, await store(), { today: TODAY, url: '/vessel/p1' });

describe('operate', () => {
  it('Shifa’s reference Soul: valid, every rule compiled, both actions pass, published', async () => {
    // @spec surgeon#1.1
    const r = await run();
    expect(r.problems).toEqual([]);
    expect(r.compiled.map((c) => [c.id, c.ok])).toEqual(SOUL.rules.map((x) => [x.id, true]));
    expect(r.compiled.find((c) => c.id === 'gst-17-truncated')).toMatchObject({
      canonical: 'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
      uses: ['bill.discount', 'bill.subtotal'],
    });
    expect(r.smoke.map((s) => [s.actionId, s.ok])).toEqual([
      ['save-bill', true],
      ['add-customer', true],
    ]);
    // A bill of one medicine from the shop's own stock, and what it wrote.
    expect(r.smoke[0]).toMatchObject({
      inputs: { lines: [{ CODE: 'PAN500', QTY: '1' }] },
      wrote: { 'BILLS.DBF': 1, 'BILLITEM.DBF': 1, 'MEDICINE.DBF': 1 },
    });
    expect(r.published).toBe(true);
    expect(r.config).toMatchObject({
      app: { id: 'shifa', name: 'Shifa Medical Store' },
      soulVersion: 1,
      url: '/vessel/p1',
      actions: [
        {
          id: 'save-bill',
          inputs: ['CUST_ID'],
          lineInputs: ['CODE', 'QTY'],
          worksOut: ['BILL_NO', 'BILL_DATE', 'SUBTOTAL', 'DISCOUNT', 'GST', 'TOTAL'],
          receipt: true,
        },
        { id: 'add-customer', inputs: ['NAME', 'PHONE'], lineInputs: [], receipt: false },
      ],
    });
  });

  it('a smoke test never changes the records it was given', async () => {
    const s = await store();
    const before = await s.records('MEDICINE.DBF');
    await operate(SOUL, s, { today: TODAY, url: '/vessel/p1' });
    expect(await s.records('MEDICINE.DBF')).toEqual(before);
    expect(await s.records('BILLS.DBF')).toHaveLength(records['BILLS.DBF']!.length);
  });

  it('a Soul that does not validate is not published, and says why', async () => {
    // @spec surgeon#1.2
    const r = await run({
      ...SOUL,
      actions: [{ ...SOUL.actions[0]!, screen: 'fp_ffffffffffffffff' }],
    });
    expect(r.published).toBe(false);
    expect(r.problems[0]).toMatch(/No screen fp_ffffffffffffffff/);
    expect(r.config).toBeNull();
  });

  it('an action whose stock change has no rule is not published; the others still are', async () => {
    const soul: Soul = { ...SOUL, rules: SOUL.rules.filter((x) => x.target !== 'medicine.qty') };
    const r = await run(soul);
    expect(r.smoke.find((s) => s.actionId === 'save-bill')).toMatchObject({
      ok: false,
      error: 'The action save-bill changes medicine, but no rule says how',
    });
    expect(r.smoke.find((s) => s.actionId === 'add-customer')!.ok).toBe(true);
    expect(r.published).toBe(true);
    expect(r.config!.actions.map((a) => a.id)).toEqual(['add-customer']);
  });

  it('a bill the rules always refuse fails its smoke test with the rule’s words', async () => {
    const soul: Soul = {
      ...SOUL,
      rules: [
        ...SOUL.rules,
        {
          id: 'never',
          kind: 'validate',
          en: 'No bill is ever accepted.',
          ur: '',
          expression: 'bill.subtotal < 0',
          evidence: [],
          confidence: 1,
        },
      ],
    };
    const r = await run(soul);
    const bill = r.smoke.find((s) => s.actionId === 'save-bill')!;
    expect(bill.ok).toBe(false);
    expect(bill.refused).toContain('No bill is ever accepted.');
  });

  it('no actions: nothing to publish', async () => {
    const r = await run({ ...SOUL, actions: [] });
    expect(r.published).toBe(false);
    expect(r.problems).toEqual(['The Soul has no actions yet, so there is no app to publish']);
  });

  it('whatever the Soul’s rules say, the Surgeon reports and never throws (invariant)', async () => {
    const expr = fc.constantFrom('1', 'bill.subtotal', 'bill.subtotal >', 'trunc(', 'x * 2', '0');
    await fc.assert(
      fc.asyncProperty(fc.array(expr, { maxLength: 4 }), async (exprs) => {
        const soul = {
          ...SOUL,
          rules: [
            ...SOUL.rules,
            ...exprs.map((e, i) => ({ ...SOUL.rules[0]!, id: `r${i}`, expression: e })),
          ],
        };
        const r = await run(soul);
        expect(typeof r.published).toBe('boolean');
        if (!r.published) expect(r.problems.length).toBeGreaterThan(0);
      }),
      { numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 50), 100) },
    );
  });
});
