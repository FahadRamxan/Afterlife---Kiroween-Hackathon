// Shrinking a difference (Prompt 69). A failing case is replayed by fast-check from its seed and
// path, then shrunk: fast-check tries smaller cases (fewer lines, smaller quantities, a shorter
// name), and keeps each one that still differs. Every try starts fresh on both sides (the old app
// booted again on its own files, a new Vessel on the same records), so the smallest case is one
// that differs on its own. A case that differed only after the cases before it on its lane does
// not differ fresh: it is kept as it was, and said so.
import type { SnapshotDiff } from '@afterlife/dbf';
import fc from 'fast-check';
import { prepareCases, type CaseContext, type ProofCase } from './arbitraries';
import { effectDifferences, type Difference } from './compare';
import { explainDifference } from './explain';
import {
  NO_EFFECTS,
  freshVessel,
  proofProperty,
  type CaseResult,
  type OldApp,
  type ProofTarget,
} from './runner';

export type Counterexample = ProofCase & {
  /** Replays it: fc.assert(property, { seed, path }). */
  seed: number;
  path: string;
  old: SnapshotDiff;
  vessel: SnapshotDiff;
  differences: Difference[];
  /** One sentence: what differs, both values, and the case. */
  explanation: string;
  /** Smaller cases kept on the way, and every case tried. */
  shrinks: number;
  tries: number;
  /** false: the case did not differ from a fresh start (only after the cases before it). */
  reproduced: boolean;
  /** The time limit stopped the shrinking before the smallest case was found. */
  interrupted: boolean;
};

/** Shrinking on the real app is a boot and a bill per try: stop after this long (2 minutes). */
export const SHRINK_TIME_LIMIT_MS = 120_000;

type Tried = { c: ProofCase; old: SnapshotDiff; vessel: SnapshotDiff; differences: Difference[] };

/** One try from a fresh start: the differences, or null when it does not differ (or cannot run). */
async function freshTry(target: ProofTarget, old: OldApp, c: ProofCase): Promise<Tried | null> {
  await old.reset();
  const vessel = await freshVessel(target.soul, target.records, target.today);
  const preview = await vessel.previewAction(c.actionId, c.inputs);
  if (!preview.ok) return null;
  let run;
  try {
    run = await old.run(c);
  } catch {
    // The old app could not be driven: that is not the difference being shrunk.
    return null;
  }
  const done = await vessel.performAction(c.actionId, c.inputs);
  const effects = done.ok ? done.effects : NO_EFFECTS;
  const differences = effectDifferences(run.effects, effects);
  return differences.length ? { c, old: run.effects, vessel: effects, differences } : null;
}

/** Shrinks a failing case of a proof run with these options to the smallest case that differs. */
export async function shrinkFailure(
  target: ProofTarget,
  failure: CaseResult,
  opts: { seed: number; actionId?: string; ctx?: CaseContext; timeLimitMs?: number },
): Promise<Counterexample> {
  const ctx = opts.ctx ?? (await prepareCases(target.soul, target.records, target));
  const path = String(failure.index);
  return target.withOldApp(async (old) => {
    let tries = 0;
    const failing = new Map<string, Tried>();
    const property = proofProperty(ctx, opts.actionId, async (c) => {
      tries++;
      const t = await freshTry(target, old, c);
      if (!t) return true;
      failing.set(JSON.stringify(c), t);
      return false;
    });
    const r = await fc.check(property, {
      seed: opts.seed,
      path,
      interruptAfterTimeLimit: opts.timeLimitMs ?? SHRINK_TIME_LIMIT_MS,
      markInterruptAsFailure: false,
    });
    const smallest =
      r.failed && r.counterexample ? failing.get(JSON.stringify(r.counterexample[0])) : undefined;
    const kept: Tried = smallest ?? {
      c: { actionId: failure.actionId, inputs: failure.inputs },
      old: failure.old ?? NO_EFFECTS,
      vessel: failure.vessel ?? NO_EFFECTS,
      differences: failure.differences ?? [],
    };
    return {
      ...kept.c,
      seed: opts.seed,
      path: smallest ? (r.counterexamplePath ?? path) : path,
      old: kept.old,
      vessel: kept.vessel,
      differences: kept.differences,
      explanation: explainDifference(target.soul, { ...kept.c, ...kept }),
      shrinks: smallest ? r.numShrinks : 0,
      tries,
      reproduced: !!smallest,
      interrupted: r.interrupted,
    };
  });
}
