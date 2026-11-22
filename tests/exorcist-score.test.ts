// @spec exorcist#1.3 Prompt 73 done when: the Exorcist finds the 2 deliberate bugs in Shifa, the
// late fee bug in Iqra and the overflow in Barkat, scored against the manifests. Shifa and Barkat
// from their recorded runs (observations and data files); Iqra from its recorded exorcise step,
// whose probes were typed into the real 2001 app at chosen DOS dates.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { exorcise, scoreExorcism, type BugTruth, type Finding } from '@afterlife/crew';
import { recordedInput } from '../packages/crew/src/exorcist/testing';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const bugs = (app: string) =>
  JSON.parse(readFileSync(resolve(root, `samples/graveyard/${app}/manifest.json`), 'utf8'))
    .knownBugs as BugTruth[];
const recordedFindings = (app: string) => {
  const rec = JSON.parse(readFileSync(resolve(root, `apps/worker/recorded/${app}.json`), 'utf8'));
  return (rec.steps.find((s: { step: string }) => s.step === 'exorcise').output?.findings ??
    []) as Finding[];
};

describe('the Exorcist against the manifests', () => {
  it('Shifa: the two-digit-year expiry and the negative stock', () => {
    const s = scoreExorcism(exorcise(recordedInput('shifa')), bugs('shifa'));
    expect(s.found).toEqual(expect.arrayContaining(['y2k-expiry', 'zero-qty-negative-stock']));
  });

  it('Barkat: the balance overflow', () => {
    expect(scoreExorcism(exorcise(recordedInput('barkat')), bugs('barkat')).found).toEqual([
      'balance-overflow-n8-2',
    ]);
  });

  it('Iqra: the late fee in calendar weeks, from the probes in the real app', () => {
    const f = recordedFindings('iqra');
    expect(scoreExorcism(f, bugs('iqra')).found).toEqual(['late-fee-calendar-weeks']);
    const late = f.find((x) => x.code === 'date-arithmetic:payment.late_fee')!;
    expect(late.evidence.filter((e) => e.kind === 'probe').length).toBeGreaterThanOrEqual(2);
  });

  it('the recorded exorcise steps found what the pure detectors find', () => {
    for (const app of ['shifa', 'barkat'] as const)
      expect(
        recordedFindings(app)
          .map((f) => f.code)
          .sort(),
      ).toEqual(
        exorcise(recordedInput(app))
          .map((f) => f.code)
          .sort(),
      );
  });
});
