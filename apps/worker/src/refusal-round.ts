// The archaeology step's refusal round (Prompt 81): the rules the old app enforces by refusing a
// typed number (Shifa: "ONLY 240 IN STOCK"). It reads the line attempts in the steps seen so far;
// when they cannot decide a rule, it types the boundary bills into the old app (a line at exactly
// the stock, and one over it), stores their steps as observations, and reads the attempts again.
// Deterministic: no model.
import { inferRefusals, lineAttempts, refusalProbes, type AttemptStep } from '@afterlife/crew';
import type { DbfValue } from '@afterlife/dbf';
import type { Observation } from '@afterlife/emulator';
import type { Rule, Soul } from '@afterlife/soul';
import type { ActionInputs } from '@afterlife/vessel';
type Step = Pick<Observation, 'keys' | 'dbfDiff'> & {
  screenBefore: AttemptStep['screenBefore'];
  screenAfter: AttemptStep['screenAfter'];
};
export type RefusalRoundDeps = {
  steps: AttemptStep[];
  draft: Pick<Soul, 'entities' | 'actions'>;
  /** The old app's records as its bundle has them (each probe boots it fresh). */
  tables: Record<string, { values: Record<string, DbfValue> }[]>;
  /** Types one bill into a freshly booted old app; absent when there is no emulator. */
  type?: (action: Soul['actions'][number], inputs: ActionInputs) => Promise<Step[]>;
  /** Stores one probe step as an observation; gives its id. */
  store?: (step: Step, hint: string) => Promise<string>;
  log: (m: string, level?: 'info' | 'warn') => Promise<void>;
  signal?: AbortSignal;
};
export async function refusalRound(
  d: RefusalRoundDeps,
): Promise<{ rules: Rule[]; probed: number }> {
  const steps = [...d.steps];
  let probed = 0;
  if (d.type && d.store) {
    const probes = refusalProbes(d.draft, lineAttempts(steps, d.draft, d.tables), d.tables);
    for (const p of probes) {
      d.signal?.throwIfAborted();
      const action = d.draft.actions.find((a) => a.id === p.actionId)!;
      const lines = p.inputs.lines
        .map((l) => Object.values(l).filter(Boolean).join(' x '))
        .join(', ');
      let typed: Step[];
      try {
        typed = await d.type(action, p.inputs);
      } catch (e) {
        if (d.signal?.aborted) throw e;
        await d.log(
          `Refusal probe ${p.why}: ${lines} could not be typed: ${(e as Error).message}`,
          'warn',
        );
        continue;
      }
      probed++;
      // Each probe boots the old app again: its first step starts from the data files' records.
      for (const [i, s] of typed.entries())
        steps.push({
          ...s,
          id: await d.store(s, `probe: ${p.why}`),
          ...(i === 0 ? { fresh: true } : {}),
        } as AttemptStep);
      await d.log(`Refusal probe ${p.why}: ${lines} typed into the old app`);
    }
  }
  const { rules } = inferRefusals(lineAttempts(steps, d.draft, d.tables), d.draft);
  return { rules, probed };
}
