import { diffTables } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { actionForm, createVessel, VesselError } from './runtime';
import { ConflictError, MemoryEntityStore } from './store';
import {
  SHIFA,
  SHIFA_FILES,
  SHIFA_TODAY,
  shifaAfter,
  shifaSeed,
  shifaStore,
} from './testing/shifa';

const vessel = async (soul: Soul = SHIFA) => {
  const store = await shifaStore();
  return { store, v: createVessel(soul, store, { today: () => SHIFA_TODAY }) };
};
/** Shifa without ALREADY IN BILL: a Soul that takes one medicine on two lines (the stock decides). */
const TWO_LINES: Soul = {
  ...SHIFA,
  rules: SHIFA.rules.filter((r) => r.id !== 'one-line-per-medicine'),
};
const KEYS: Record<string, string | null> = {
  'BILLS.DBF': 'BILL_NO',
  'BILLITEM.DBF': null,
  'MEDICINE.DBF': 'CODE',
  'CUSTOMER.DBF': 'CUST_ID',
};

/** What the real old app did for a scenario: its data files diffed against the seed. */
function oldApp(scenario: string) {
  const out: Record<string, ReturnType<typeof diffTables>> = {};
  for (const f of SHIFA_FILES) {
    const d = diffTables(shifaSeed(f), shifaAfter(scenario, f), { key: KEYS[f]! });
    if (d.inserted.length || d.updated.length || d.deleted.length) out[f] = d;
  }
  return out;
}

describe('performAction on Shifa: the same effects as the real 1998 app', () => {
  // The scripted bills, as typed into the real app in DOSBox (samples/graveyard/shifa/scenarios).
  const bills = {
    'bill-small': {
      values: { CUST_ID: '' },
      lines: [
        { CODE: 'PAN500', QTY: '4' },
        { CODE: 'BRU400', QTY: '2' },
      ],
    },
    'bill-discount': { values: { CUST_ID: 'C0002' }, lines: [{ CODE: 'INS100', QTY: '8' }] },
    'bill-5000': {
      values: {},
      lines: [
        { CODE: 'INS100', QTY: '7' },
        { CODE: 'DIS500', QTY: '72' },
      ],
    },
  };
  for (const [scenario, inputs] of Object.entries(bills))
    it(`${scenario}: the effects equal the DBF diff of the old app's run`, async () => {
      const { v } = await vessel();
      const r = await v.performAction('save-bill', inputs);
      if (!r.ok) throw new Error(JSON.stringify(r.refused));
      expect(r.effects.tables).toEqual(oldApp(scenario));
    });

  it('a bill over Rs 5,000: 10% off, GST on the rest, truncated; the stock goes down', async () => {
    const { v } = await vessel();
    const r = await v.performAction('save-bill', bills['bill-discount']);
    if (!r.ok) throw new Error('refused');
    expect(r.record).toMatchObject({
      BILL_NO: '9807-0001',
      BILL_DATE: '19980715',
      CUST_ID: 'C0002',
      SUBTOTAL: '5200.00',
      DISCOUNT: '520.00',
      GST: '795.60',
      TOTAL: '5475.60',
    });
    expect(r.lines).toEqual([
      {
        BILL_NO: '9807-0001',
        LINE: '1',
        CODE: 'INS100',
        QTY: '8',
        PRICE: '650.00',
        AMOUNT: '5200.00',
      },
    ]);
    expect(r.effects.tables['MEDICINE.DBF']!.updated).toEqual([
      {
        key: 'INS100',
        beforeRecno: 8,
        afterRecno: 8,
        changes: [{ field: 'QTY', before: '12', after: '4', delta: '-8' }],
      },
    ]);
  });

  it('the next bill gets the next number, and reads back from the store', async () => {
    const { v, store } = await vessel();
    await v.performAction('save-bill', bills['bill-small']);
    const r = await v.performAction('save-bill', bills['bill-small']);
    expect(r.ok && r.record.BILL_NO).toBe('9807-0002');
    const bills_ = await store.records('BILLS.DBF');
    expect(bills_.map((b) => b.values.BILL_NO).slice(-2)).toEqual(['9807-0001', '9807-0002']);
    // The same medicine again on one bill is refused, as the old app does (ALREADY IN BILL).
    const twice = await v.performAction('save-bill', {
      lines: [
        { CODE: 'PAN500', QTY: '1' },
        { CODE: 'PAN500', QTY: '2' },
      ],
    });
    expect(twice.ok ? [] : twice.refused).toEqual(
      [1, 2].map((line) => ({
        message:
          'A medicine can be on a bill only once: adding it again is refused (ALREADY IN BILL).',
        rule: 'one-line-per-medicine',
        line,
      })),
    );
  });
});

describe('what the app refuses (and then nothing changes)', () => {
  const refuse = async (
    inputs: Parameters<ReturnType<typeof createVessel>['performAction']>[1],
    soul: Soul = SHIFA,
  ) => {
    const { v, store } = await vessel(soul);
    const before = await Promise.all(SHIFA_FILES.map((f) => store.records(f)));
    const r = await v.performAction('save-bill', inputs);
    expect(await Promise.all(SHIFA_FILES.map((f) => store.records(f)))).toEqual(before);
    if (r.ok) throw new Error('it was not refused');
    return r.refused;
  };

  it('an expired batch (SEP200, 30 June 1998), with the rule’s own words', async () => {
    expect(await refuse({ lines: [{ CODE: 'SEP200', QTY: '1' }] })).toEqual([
      {
        message:
          'A medicine whose batch has expired cannot be added to a bill. A batch that expires today can.',
        rule: 'expired-batch-blocked',
        line: 1,
      },
    ]);
  });

  it('a rule that cannot be worked out says so, marked as the Soul’s error (Prompt 70)', async () => {
    const broken: Soul = {
      ...SHIFA,
      rules: SHIFA.rules.map((r) =>
        r.id === 'gst-17-truncated' ? { ...r, expression: 'bill.nonsense * 0.17' } : r,
      ),
    };
    const [r] = await refuse({ lines: [{ CODE: 'PAN500', QTY: '1' }] }, broken);
    expect(r).toMatchObject({ rule: 'gst-17-truncated', error: true });
    expect(r!.message).toMatch(/nonsense/);
    // A refusal by the rules is not an error.
    expect((await refuse({ lines: [{ CODE: 'SEP200', QTY: '1' }] }))[0]!.error).toBeUndefined();
  });

  it('more than the stock, an unknown code, an unknown customer, a bad number, no lines', async () => {
    expect((await refuse({ lines: [{ CODE: 'THY050', QTY: '5' }] }))[0]).toMatchObject({
      rule: 'qty-over-stock-refused',
      line: 1,
    });
    expect(await refuse({ lines: [{ CODE: 'NOPE01', QTY: '1' }] })).toEqual([
      { message: 'There is no medicine with CODE NOPE01', field: 'CODE', line: 1 },
    ]);
    expect(
      (await refuse({ values: { CUST_ID: 'C9999' }, lines: [{ CODE: 'PAN500', QTY: '1' }] }))[0],
    ).toMatchObject({
      field: 'CUST_ID',
    });
    expect(await refuse({ lines: [{ CODE: 'PAN500', QTY: '1.5' }] })).toEqual([
      { message: 'QTY must be a whole number', field: 'QTY', line: 1 },
    ]);
    expect(await refuse({ lines: [] })).toEqual([{ message: 'Bill needs at least one bill line' }]);
  });

  it('two lines of one medicine cannot sell more than its stock between them', async () => {
    // PAN500 has 240: 200 and then 100 would leave -60. (The old app does not take a second line of
    // one medicine at all, ALREADY IN BILL; this Soul has no such rule, so the stock rule decides.)
    expect(
      await refuse(
        {
          lines: [
            { CODE: 'PAN500', QTY: '200' },
            { CODE: 'PAN500', QTY: '100' },
          ],
        },
        TWO_LINES,
      ),
    ).toEqual([
      {
        message: 'A quantity larger than the stock is refused when the item is added.',
        rule: 'qty-over-stock-refused',
        line: 2,
      },
    ]);
  });

  it('a value the app works out cannot be typed', async () => {
    expect(
      await refuse({ values: { TOTAL: '1.00' }, lines: [{ CODE: 'PAN500', QTY: '1' }] }),
    ).toEqual([{ message: 'TOTAL is worked out by the app, not typed', field: 'TOTAL' }]);
  });
});

describe('two lines of one medicine', () => {
  it('that fit its stock together are taken, and the stock goes down by both', async () => {
    const { v, store } = await vessel(TWO_LINES);
    const r = await v.performAction('save-bill', {
      lines: [
        { CODE: 'PAN500', QTY: '200' },
        { CODE: 'PAN500', QTY: '40' },
      ],
    });
    expect(r.ok).toBe(true);
    const pan = (await store.records('MEDICINE.DBF')).find((x) => x.values.CODE === 'PAN500');
    expect(String(pan?.values.QTY)).toBe('0');
  });
});

describe('the store and the Soul', () => {
  it('effects that no longer fit the store are refused whole: a ConflictError, no change', async () => {
    const { v, store } = await vessel();
    const r = await v.performAction('save-bill', { lines: [{ CODE: 'PAN500', QTY: '1' }] });
    if (!r.ok) throw new Error('refused');
    const after = await Promise.all(SHIFA_FILES.map((f) => store.records(f)));
    // The same effects again: the bill's record number is taken, the stock is not 240 any more.
    await expect(store.commit(r.effects)).rejects.toBeInstanceOf(ConflictError);
    expect(await Promise.all(SHIFA_FILES.map((f) => store.records(f)))).toEqual(after);
  });

  it('an unknown action, or a Soul it cannot run, is a VesselError', async () => {
    const store = new MemoryEntityStore();
    await expect(
      createVessel(SHIFA, store, { today: () => SHIFA_TODAY }).performAction('nope'),
    ).rejects.toBeInstanceOf(VesselError);
    const noStockRule: Soul = {
      ...SHIFA,
      rules: SHIFA.rules.filter((r) => r.id !== 'stock-decrement'),
    };
    await expect(
      createVessel(noStockRule, store, { today: () => SHIFA_TODAY }).performAction('save-bill'),
    ).rejects.toThrow(/changes medicine, but no rule says how/);
    const circle: Soul = {
      ...SHIFA,
      rules: SHIFA.rules.map((r) =>
        r.id === 'bill-subtotal' ? { ...r, expression: 'bill.total - 1' } : r,
      ),
    };
    await expect(
      createVessel(circle, store, { today: () => SHIFA_TODAY }).performAction('save-bill'),
    ).rejects.toThrow(/circle/);
  });
});

describe('previewAction', () => {
  it('gives the same result as performing it, and saves nothing', async () => {
    const { v, store } = await vessel();
    const inputs = { values: { CUST_ID: 'C0002' }, lines: [{ CODE: 'INS100', QTY: '8' }] };
    const before = await Promise.all(SHIFA_FILES.map((f) => store.records(f)));
    const preview = await v.previewAction('save-bill', inputs);
    expect(await Promise.all(SHIFA_FILES.map((f) => store.records(f)))).toEqual(before);
    expect(await v.performAction('save-bill', inputs)).toEqual(preview);
  });
});

describe('actionForm', () => {
  it('asks for what the owner types: the customer, and each line’s code and quantity', () => {
    const f = actionForm(SHIFA, 'save-bill');
    expect(f.header.entity.id).toBe('bill');
    expect(f.header.inputs.map((x) => x.name)).toEqual(['CUST_ID']);
    expect(f.header.computed.map((x) => x.name)).toEqual([
      'BILL_NO',
      'BILL_DATE',
      'SUBTOTAL',
      'DISCOUNT',
      'GST',
      'TOTAL',
    ]);
    expect(f.line?.entity.id).toBe('bill-item');
    expect(f.line?.inputs.map((x) => x.name)).toEqual(['CODE', 'QTY']);
    expect(f.line?.links.map((l) => `${l.field} -> ${l.entity.id}.${l.refField}`)).toEqual([
      'CODE -> medicine.CODE',
    ]);
    expect(f.header.links.map((l) => l.entity.id)).toEqual(['customer']);
    expect(() => actionForm(SHIFA, 'nope')).toThrow(VesselError);
  });
});
