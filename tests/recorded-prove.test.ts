// @spec oracle-proof#4.1 The recorded runs include the prove step (Prompt 70): the real Oracle ran
// 50 cases of each sample app's own inferred Soul on the 1998 app in js-dos and on the Vessel, an
// event per case, and the first difference shrunk and explained.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Case = { type: string; payload: { index: number; of: number; done: number; outcome: string } };
type Rec = {
  soul: { actions: { id: string }[] };
  steps: {
    step: string;
    status: string;
    events: Case[];
    output: {
      numRuns: number;
      passed: number;
      failed: number;
      skipped: number;
      counterexample: { explanation: string; reproduced: boolean; actionId: string } | null;
    };
  }[];
};
const rec = (app: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../apps/worker/recorded/${app}.json`), 'utf8'),
  ) as Rec;

describe('the recorded prove step', () => {
  it.each(['shifa', 'iqra', 'barkat'])(
    '%s: 50 cases, each one an event, every one counted',
    (app) => {
      const r = rec(app);
      const step = r.steps.find((s) => s.step === 'prove')!;
      expect(step.status).toBe('done');
      const o = step.output;
      expect(o.numRuns).toBe(50);
      expect(o.passed + o.failed + o.skipped).toBe(50);
      const cases = step.events.filter((e) => e.type === 'proof_case').map((e) => e.payload);
      expect(cases.map((c) => c.index).sort((a, b) => a - b)).toEqual([...Array(50).keys()]);
      expect(cases.at(-1)!.done).toBe(50);
      expect(cases.filter((c) => c.outcome === 'fail')).toHaveLength(o.failed);
      // Every case is of an action of the Soul it proved.
      const actions = new Set(r.soul.actions.map((a) => a.id));
      for (const e of step.events.filter((x) => x.type === 'proof_case'))
        expect(actions.has((e.payload as unknown as { actionId: string }).actionId)).toBe(true);
      if (o.failed) {
        expect(o.counterexample!.explanation).toMatch(/^(Old|New) app /);
        expect(actions.has(o.counterexample!.actionId)).toBe(true);
      } else expect(o.counterexample).toBeNull();
    },
  );

  it('Shifa: some cases agree with the 1998 app, and the differences are shrunk', () => {
    const o = rec('shifa').steps.find((s) => s.step === 'prove')!.output;
    expect(o.passed).toBeGreaterThan(25);
    expect(o.counterexample?.reproduced ?? true).toBe(true);
  });
});
