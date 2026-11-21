// @spec vessel-receipts#2.2 The receipt layout the real pipeline read off the real old app.
// Prompt 61: the recorded Shifa run (apps/worker/recorded/shifa.json, `pnpm pipeline:record`) is
// the archaeology step on a real possession of the 1998 app in js-dos. Its Soul's save-bill gets
// the layout of the NEW BILL screen the old app was on when F2 saved each bill.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SoulSchema } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { describe, expect, it } from 'vitest';

const recorded = SoulSchema.parse(
  (
    JSON.parse(readFileSync(resolve(__dirname, '../apps/worker/recorded/shifa.json'), 'utf8')) as {
      soul: unknown;
    }
  ).soul,
);
const reference = SHIFA_REFERENCE_SOUL.actions.find((a) => a.id === 'save-bill')!.receipt!;

describe('the receipt layout of the recorded Shifa run', () => {
  it('has the reference Soul’s columns and totals, in the old screen’s order', () => {
    const r = recorded.actions.find((a) => a.id === 'save-bill')!.receipt!;
    expect(r.columns).toEqual(reference.columns);
    expect(r.totals).toEqual(reference.totals);
  });

  it('its header: the bill’s number, date and customer (WALK-IN when blank)', () => {
    const r = recorded.actions.find((a) => a.id === 'save-bill')!.receipt!;
    // The Possessor's bills are all walk-ins, so no customer's name was ever on the screen.
    expect(r.header).toEqual(reference.header.filter((h) => h.ref !== 'customer.NAME'));
  });

  it('adding a customer prints nothing', () => {
    expect(recorded.actions.find((a) => a.id === 'add-customer')!.receipt).toBeUndefined();
  });
});
