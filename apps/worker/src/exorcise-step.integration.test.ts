// @spec exorcist#1.2 The late fee probes in the real Iqra School Fees (2001) in headless js-dos:
// the payment typed again with the DOS clock at chosen dates, and the old app's own fees judged.
import { exorcise, lateFeePlan, type LateFeeResult } from '@afterlife/crew';
import { recordedInput } from '@afterlife/crew/exorcist/testing';
import { HeadlessPool } from '@afterlife/emulator/headless';
import { emulatorOldApp } from '@afterlife/oracle';
import { afterAll, describe, expect, it } from 'vitest';
import { loadRecording } from './recording';
import { graveyardBundle } from './possess';
import { graphOf } from './prove-step';

const pool = new HeadlessPool({ size: 1, cycles: 60_000, keyDelayMs: 50 });
afterAll(() => pool.close());

describe('the late fee of the real Iqra app', () => {
  it('1 day late on a Sunday costs nothing; 8 days late costs one week: calendar weeks', async () => {
    const input = recordedInput('iqra');
    const plan = lateFeePlan(input)!;
    const bundle = graveyardBundle({ source: 'graveyard', sourceApp: 'iqra' })!;
    // The screens the Possessor mapped in the recorded run, as the step loads them for a project.
    const possess = loadRecording('iqra')!.steps.find((s) => s.step === 'possess')!;
    const graph = graphOf(
      input.soul,
      (possess.output as { graph: Parameters<typeof graphOf>[1] }).graph,
    );
    const results: LateFeeResult[] = [];
    for (const date of plan.probes) {
      const diff = await pool.use(
        bundle,
        async (emu) =>
          (
            await emulatorOldApp(emu, { soul: input.soul, graph }).run({
              actionId: plan.actionId,
              inputs: plan.inputs,
            })
          ).effects,
        { dosTime: `${date} 10:00:00` },
      );
      const r = diff.tables['PAYMENT.DBF']?.inserted[0];
      results.push({ date, lateFee: r ? String(r.values.LATE_FEE).trim() : null, ref: date });
    }
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '2001-03-11', lateFee: '0.00' }),
        expect.objectContaining({ date: '2001-03-18', lateFee: '50.00' }),
      ]),
    );
    const found = exorcise(input, { plan, results }).find((f) => f.smell === 'date-arithmetic');
    expect(found).toMatchObject({ code: 'date-arithmetic:payment.late_fee', severity: 'medium' });
  }, 180_000);
});
