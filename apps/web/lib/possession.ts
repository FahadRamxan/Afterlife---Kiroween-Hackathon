// The Possessor's progress on the Possession tab (Prompt 48), from its live observation events.
// Each event carries the run's totals so far, so the newest one is enough (the live view keeps
// only the last 200 events).
import { z } from 'zod';
import type { LiveEvent } from './live';

const ObservationEvent = z.object({
  step: z.number().int().positive(),
  label: z.string(),
  to: z.string(),
  newScreen: z.boolean(),
  changed: z.array(z.string()),
  errors: z.array(z.string()),
  /** Screen states (fingerprints) so far, and screens (states grouped by title): review 51-60. */
  screens: z.number().int().nonnegative(),
  titles: z.number().int().nonnegative().optional(),
  saves: z.number().int().nonnegative(),
  /** `guide`: a step of the owner's séance, walked first (Prompt 50). */
  kind: z.enum(['explore', 'walk', 'back', 'guide']).optional(),
  /** What the owner said over it. */
  hint: z.string().optional(),
  /** The run's totals so far (review 41-50): they outlast the 200 events the live view keeps. */
  guided: z.number().int().nonnegative().optional(),
  refused: z
    .array(z.object({ text: z.string(), label: z.string(), step: z.number().int() }))
    .optional(),
});
export type ObservationEvent = z.infer<typeof ObservationEvent>;

export type PossessionStats = {
  /** Screen states, and screens by title (null for a run recorded before titles were counted). */
  screens: number;
  titles: number | null;
  actions: number;
  changes: number;
  /** The newest few steps, newest last. */
  recent: ObservationEvent[];
  /** Steps that followed the owner's séance, and what the owner said over them. */
  guided: number;
  hints: { step: number; label: string; hint: string }[];
  /** Each error line the app showed, once, with the step and the value that caused it. */
  refused: { text: string; label: string; step: number }[];
};

/** Null until the first observation of the newest possession. */
export function possessionStats(events: LiveEvent[], recent = 5): PossessionStats | null {
  const obs: ObservationEvent[] = [];
  for (const e of events) {
    if (e.type !== 'observation') continue;
    const p = ObservationEvent.safeParse(e.payload);
    if (!p.success) continue;
    // A new run (a re-run of possess) starts again at step 1.
    if (p.data.step === 1) obs.length = 0;
    obs.push(p.data);
  }
  const last = obs.at(-1);
  if (!last) return null;
  return {
    screens: last.screens,
    titles: last.titles ?? null,
    actions: last.step,
    changes: last.saves,
    recent: obs.slice(-recent),
    // The worker's totals when it sends them; counted from the kept events for older runs.
    guided: last.guided ?? obs.filter((o) => o.kind === 'guide').length,
    hints: obs.flatMap((o) => (o.hint ? [{ step: o.step, label: o.label, hint: o.hint }] : [])),
    refused:
      last.refused ??
      obs
        .flatMap((o) => o.errors.map((text) => ({ text, label: o.label, step: o.step })))
        .filter((x, i, all) => all.findIndex((y) => y.text === x.text) === i),
  };
}
