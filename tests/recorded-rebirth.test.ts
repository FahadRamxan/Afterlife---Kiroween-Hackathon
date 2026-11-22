// @spec surgeon#2.2 The recorded runs include the rebirth step (Prompt 63): the real pipeline on
// each sample app published its reborn app, every rule compiled, every action passing its smoke
// test. Demo mode replays them, so a recorded raise ends with the Reborn card.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rec = {
  steps: {
    step: string;
    status: string;
    output: {
      published?: boolean;
      actions?: { id: string; ok: boolean }[];
      rules?: { compiled: number; failed: number };
      problems?: string[];
    } | null;
  }[];
  soul?: { actions: { id: string }[] };
};
const rec = (app: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../apps/worker/recorded/${app}.json`), 'utf8'),
  ) as Rec;

describe('the recorded rebirth step', () => {
  it.each(['shifa', 'iqra', 'barkat'])('%s: published, every action of its Soul passing', (app) => {
    const r = rec(app);
    const step = r.steps.find((s) => s.step === 'rebirth')!;
    expect(step.status).toBe('done');
    expect(step.output).toMatchObject({ published: true, problems: [] });
    expect(step.output!.rules!.failed).toBe(0);
    expect(step.output!.actions!.map((a) => [a.id, a.ok])).toEqual(
      r.soul!.actions.map((a) => [a.id, true]),
    );
  });
});
