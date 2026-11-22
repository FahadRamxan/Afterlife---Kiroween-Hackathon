// @spec archaeologist-completion#1 Actions from the observations.
// @spec archaeologist-completion#1.2 inferActions on the recorded possessions.
// Review of 51-60, item 1 done when: on the recorded Shifa possession (a real run of the real app,
// apps/worker/recorded/shifa.json), the inferred actions are the reference Soul's save-bill and
// add-customer. Iqra's and Barkat's recorded runs give their own saves too.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inferActions, stepFromEvent } from '@afterlife/crew';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { macroFields } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { sampleInputs } from '../scripts/score-archaeology';

const steps = (app: string) => {
  const rec = JSON.parse(
    readFileSync(resolve(__dirname, `../apps/worker/recorded/${app}.json`), 'utf8'),
  ) as { steps: { step: string; events: { type: string; payload: Record<string, unknown> }[] }[] };
  return rec.steps
    .find((s) => s.step === 'possess')!
    .events.filter((e) => e.type === 'observation')
    .map((e) => stepFromEvent(e.payload));
};
// A recorded event keeps no screen model, so no receipt layout can be read off it (Prompt 61).
const withoutScreen = <T extends { screen: string; receipt?: unknown }>(a: T) => ({
  ...a,
  screen: '',
  receipt: undefined,
});

describe('inferActions on the recorded possessions', () => {
  it('Shifa: the reference Soul’s save-bill and add-customer, macros and effects included', () => {
    const actions = inferActions(steps('shifa'), SHIFA_REFERENCE_SOUL.entities);
    expect(actions.map(withoutScreen)).toEqual(SHIFA_REFERENCE_SOUL.actions.map(withoutScreen));
    // Each starts on the screen the macro begins on (a state of NEW BILL, of CUSTOMERS).
    for (const a of actions) expect(a.screen).toMatch(/^fp_[0-9a-f]{16}$/);
  });

  it('Iqra and Barkat: each save is an action with a macro of the fields typed', async () => {
    for (const app of ['iqra', 'barkat']) {
      const { entities } = await sampleInputs(app);
      const actions = inferActions(steps(app), entities);
      expect(actions.length, app).toBeGreaterThan(0);
      for (const a of actions) {
        expect(a.effects[0]!.kind, `${app} ${a.id}`).toBe('insert');
        expect(macroFields(a.keys).record.length, `${app} ${a.id} ${a.keys}`).toBeGreaterThan(0);
      }
    }
  });
});
