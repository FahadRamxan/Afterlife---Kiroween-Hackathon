// @spec exorcist#2.1 Keep or fix, as rule edits of the Soul (Prompt 74), checked in the Vessel.
import { SHIFA_REFERENCE_SOUL, SHIFA_AS_IT_RUNS_SOUL } from '@afterlife/soul/examples/shifa';
import type { Soul } from '@afterlife/soul';
import { MemoryEntityStore, createVessel } from '@afterlife/vessel';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exorcise } from './exorcise';
import { applyEdits, remedyFor, undoFixes } from './remedies';
import { recordedInput } from './testing';
import type { Finding } from './types';

const shifa = recordedInput('shifa');
const found = (code: string) => exorcise(shifa).find((f) => f.code === code)!;
const y2k = found('two-digit-year:medicine.expiry');
const negative = found('negative-allowed:medicine.qty');

/** Sells one of `code` in a Vessel running `soul` on Shifa's records, on 15 July 1998. */
async function sells(soul: Soul, code: string, qty = '1') {
  const store = new MemoryEntityStore();
  for (const [f, r] of Object.entries(shifa.records)) await store.load(f, r);
  const v = createVessel(soul, store, { today: () => '1998-07-15' });
  return (
    await v.previewAction('save-bill', {
      values: { CUST_ID: '' },
      lines: [{ CODE: code, QTY: qty }],
    })
  ).ok;
}

describe('remedyFor: two-digit years', () => {
  it('the inferred Soul has no expiry check: Keep adds the old two-digit one, Fix the four-digit one', async () => {
    const r = remedyFor(y2k, shifa.soul);
    expect(r.keep).toHaveLength(1);
    expect(r.fix).toHaveLength(1);
    const keep = applyEdits(shifa.soul, r.keep);
    const fix = applyEdits(shifa.soul, r.fix!);
    // ORS001 is good until 30/06/2000: the old app refuses it in 1998, the fixed app sells it.
    expect(await sells(shifa.soul, 'ORS001')).toBe(true);
    expect(await sells(keep, 'ORS001')).toBe(false);
    expect(await sells(fix, 'ORS001')).toBe(true);
    // SEP200 expired on 30/06/1998: both refuse it. PAN500 (1999) both sell.
    for (const s of [keep, fix]) {
      expect(await sells(s, 'SEP200')).toBe(false);
      expect(await sells(s, 'PAN500')).toBe(true);
    }
    expect(r.fixEn).toBe('EXPIRY is compared with four-digit years');
  });

  it('a Soul that already has the check gets it rewritten, not a second one', () => {
    const r = remedyFor(y2k, SHIFA_REFERENCE_SOUL);
    expect(r.keep).toEqual([expect.objectContaining({ op: 'set', id: 'expired-batch-blocked' })]);
    const keep = applyEdits(SHIFA_REFERENCE_SOUL, r.keep);
    expect(keep.rules.length).toBe(SHIFA_REFERENCE_SOUL.rules.length);
    // Keep is the app as it really runs.
    expect(keep.rules.find((x) => x.id === 'expired-batch-blocked')!.expression).toBe(
      SHIFA_AS_IT_RUNS_SOUL.rules.find((x) => x.id === 'expired-batch-blocked')!.expression,
    );
  });
});

describe('remedyFor: the other smells', () => {
  it('negative stock: Keep changes nothing; Fix refuses a bill that takes the stock below zero', async () => {
    const r = remedyFor(negative, shifa.soul);
    expect(r.keep).toEqual([]);
    const fix = applyEdits(shifa.soul, r.fix!);
    // INS100: 12 in stock.
    expect(await sells(shifa.soul, 'INS100', '13')).toBe(true);
    expect(await sells(fix, 'INS100', '13')).toBe(false);
    expect(await sells(fix, 'INS100', '12')).toBe(true);
  });

  it('a late fee in calendar weeks cannot be fixed in the rule language, and says why', () => {
    const late: Finding = {
      ...negative,
      code: 'date-arithmetic:payment.late_fee',
      smell: 'date-arithmetic',
      target: 'payment.late_fee',
    };
    const r = remedyFor(late, recordedInput('iqra').soul);
    expect(r.fix).toBeNull();
    expect(r.why).toMatch(/cannot count calendar weeks/);
  });
});

describe('undoFixes', () => {
  it('undoing a fix gives the Soul as Keep would have made it (round-trip)', () => {
    const findings = exorcise(shifa).filter((f) => remedyFor(f, shifa.soul).fix);
    fc.assert(
      fc.property(fc.subarray(findings, { minLength: 1 }), (chosen) => {
        let fixed = shifa.soul;
        let kept = shifa.soul;
        for (const f of chosen) {
          const r = remedyFor(f, shifa.soul);
          fixed = applyEdits(fixed, r.fix!);
          kept = applyEdits(kept, r.keep);
        }
        const remedies = chosen.map((f) => remedyFor(f, shifa.soul));
        expect(undoFixes(fixed, remedies).rules).toEqual(kept.rules);
      }),
    );
  });
});
