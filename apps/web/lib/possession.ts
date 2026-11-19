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
  screens: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative(),
});
export type ObservationEvent = z.infer<typeof ObservationEvent>;

export type PossessionStats = {
  screens: number;
  actions: number;
  changes: number;
  /** The newest few steps, newest last. */
  recent: ObservationEvent[];
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
    actions: last.step,
    changes: last.saves,
    recent: obs.slice(-recent),
  };
}
