// The differential runner (Prompt 68): the proof that the reborn app does what the old app did.
// fast-check makes up the cases (arbitraries.ts) from a seed; each case runs in the old app and in
// the Vessel, from the same records, and their effects on the data files are compared.
//
// The cases run on lanes: one old app and one Vessel each, kept in lockstep. A lane takes every
// lanes-th case, in order, so each case starts from what the cases before it on its lane left,
// the same on both sides (a bill's stock is gone in both). Every `restartEvery` cases, and after
// a difference (the two sides no longer start from the same records), both start again from the
// old app's own records. Which lane runs a case depends only on its number, so the same seed and
// lanes give the same run.
import type { DbfRecord, SnapshotDiff } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { MemoryEntityStore, createVessel, type Vessel } from '@afterlife/vessel';
import fc from 'fast-check';
import { caseArbitrary, prepareCases, type CaseContext, type ProofCase } from './arbitraries';
import { effectDifferences, type Difference } from './compare';

/** One run of a case in the old app: what it did to the data files, and its screen after. */
export type OldRun = { effects: SnapshotDiff; screen?: string[] };

/** The old app as the runner drives it (the emulator, or a Vessel in tests). */
export type OldApp = {
  /** Performs a case from wherever the app is, on its records as the cases before left them. */
  run(c: ProofCase): Promise<OldRun>;
  /** Back to the start: the app's own records, freshly started. */
  reset(): Promise<void>;
};

/**
 * `accepted`: the reborn app differs from the old app exactly as the owner's fixes say it should
 * (the old behaviour, run next to it, does what the old app did): an accepted divergence (Prompt 74).
 */
export type CaseOutcome = 'pass' | 'fail' | 'skip' | 'accepted';

export type CaseResult = {
  /** The case's number from 0. */
  index: number;
  /** fast-check's run that made it: its path, to replay it alone (the index when absent). */
  run?: number;
  lane: number;
  actionId: string;
  inputs: ProofCase['inputs'];
  outcome: CaseOutcome;
  /** Each side's effects (absent for a skip). */
  old?: SnapshotDiff;
  vessel?: SnapshotDiff;
  /** The old app's screen after the case. */
  screen?: string[];
  /** What differs (a fail). */
  differences?: Difference[];
  /** Why it was skipped (the Vessel's refusal) or why the old app could not run it. */
  reason?: string;
  ms: number;
  /** Not run again: the change since the last proof does not touch it, and it held then. */
  reused?: true;
};

export type ProofTarget = {
  soul: Soul;
  /** The old app's records at the start, by file (MEDICINE.DBF), as its bundle has them. */
  records: Record<string, DbfRecord[]>;
  /** The old app's date (YYYY-MM-DD). */
  today: string;
  /** Runs `work` with an old app, started fresh (one emulator from the pool). Once per lane. */
  withOldApp<R>(work: (old: OldApp) => Promise<R>): Promise<R>;
};

export type ProofOptions = {
  numRuns: number;
  seed: number;
  /** Lanes at once (default 1): as many emulators as the pool has room for. */
  lanes?: number;
  /** Each lane starts again from the app's own records after this many cases (default 25). */
  restartEvery?: number;
  /** Only this action's cases. */
  actionId?: string;
  /** Worked out beforehand (prepareCases), or here. */
  ctx?: CaseContext;
  /**
   * The Soul that does what the old app does, the owner's fixes undone (Prompt 74). It runs next
   * to the reborn app; a difference it explains is accepted, not failed.
   */
  oldBehaviour?: Soul;
  /** A case's result from the last proof, when the change since does not touch it (Prompt 74). */
  reuse?: (
    c: ProofCase,
    index: number,
  ) =>
    | Omit<CaseResult, 'index' | 'lane' | 'ms'>
    | null
    | Promise<Omit<CaseResult, 'index' | 'lane' | 'ms'> | null>;
  /** Called as each case finishes, in the order they finish. */
  onCase?: (r: CaseResult) => void | Promise<void>;
  signal?: AbortSignal;
};

export type ProofResult = {
  seed: number;
  numRuns: number;
  lanes: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Cases that differ only as the owner's fixes say they should. */
  accepted: number;
  /** Of all the cases, those taken from the last proof without running them again. */
  reused: number;
  /** Every case, by number. */
  cases: CaseResult[];
  /** The first case that differed, by number. */
  firstFailure: CaseResult | null;
};

export const RESTART_EVERY = 25;

/** The fast-check property the cases come from: sampling it gives fc.assert's own cases. */
export function proofProperty(
  ctx: CaseContext,
  actionId: string | undefined,
  /** Returns false (or throws) when the case shows a difference. */
  check: (c: ProofCase) => Promise<boolean | void> = async () => {},
) {
  return fc.asyncProperty(caseArbitrary(ctx, actionId), check);
}

/**
 * The cases a proof runs: the ones fc.assert makes from the seed, in order, so case i replays
 * alone with path `${i}` (fc.sample biases its values differently, so it is not used).
 */
/** fast-check runs per case asked for: room to skip the repeats. */
const DISTINCT_TRIES = 5;
export async function proofCases(
  ctx: CaseContext,
  opts: { numRuns: number; seed: number; actionId?: string },
): Promise<ProofCase[]> {
  // No case twice (Prompt 81): a 200-case proof had 3 bills 7 to 9 times each. fast-check is
  // asked for more runs and the repeats are skipped; each case keeps the run that made it, so it
  // still replays alone from the seed.
  const cases: ProofCase[] = [];
  const seen = new Set<string>();
  let run = 0;
  const property = proofProperty(ctx, opts.actionId, async (c) => {
    const at = run++;
    const key = JSON.stringify([c.actionId, c.inputs]);
    if (cases.length >= opts.numRuns || seen.has(key)) return;
    seen.add(key);
    cases.push({ ...c, run: at });
  });
  await fc.check(property, { numRuns: opts.numRuns * DISTINCT_TRIES, seed: opts.seed });
  return cases;
}

/** A Vessel on a fresh copy of the records. */
export async function freshVessel(
  soul: Soul,
  records: Record<string, DbfRecord[]>,
  today: string,
): Promise<Vessel> {
  const store = new MemoryEntityStore();
  for (const [file, r] of Object.entries(records)) await store.load(file, r);
  return createVessel(soul, store, { today: () => today });
}

/** What a refused case did: nothing. */
export const NO_EFFECTS: SnapshotDiff = {
  tables: {},
  unchanged: [],
  addedTables: [],
  removedTables: [],
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Runs the cases of a proof on the old app and the Vessel, and compares every one. */
export async function proveEquivalence(
  target: ProofTarget,
  opts: ProofOptions,
): Promise<ProofResult> {
  const lanes = Math.max(1, Math.min(opts.lanes ?? 1, opts.numRuns || 1));
  const restartEvery = Math.max(1, opts.restartEvery ?? RESTART_EVERY);
  const ctx = opts.ctx ?? (await prepareCases(target.soul, target.records, target));
  const cases = await proofCases(ctx, opts);
  const results: CaseResult[] = [];

  const runLane = (lane: number) =>
    target.withOldApp(async (old) => {
      const keepOf = () =>
        opts.oldBehaviour ? freshVessel(opts.oldBehaviour, target.records, target.today) : null;
      let vessel = await freshVessel(target.soul, target.records, target.today);
      let keep = await keepOf();
      let since = 0;
      const restart = async () => {
        await old.reset();
        vessel = await freshVessel(target.soul, target.records, target.today);
        keep = await keepOf();
        since = 0;
      };
      /** The old behaviour does what the old app did: the difference is the fix, accepted. */
      const explained = async (c: ProofCase, oldEffects: SnapshotDiff) => {
        if (!keep) return false;
        // Two ways an app treats a line its rules refuse: the whole record refused, or (as Shifa
        // does with an expired batch) the line refused when it is typed and the record saved
        // without it. The old behaviour explains the case if either does what the old app did;
        // it then performs that one, so it keeps step with the old app.
        const lines: Record<string, string>[] = [];
        for (const l of c.inputs.lines ?? [])
          if ((await keep.previewAction(c.actionId, { ...c.inputs, lines: [l] })).ok) lines.push(l);
        const ways = [
          c.inputs,
          ...(c.inputs.lines && lines.length < c.inputs.lines.length
            ? [{ ...c.inputs, lines }]
            : []),
        ];
        for (const typed of ways) {
          const p = await keep.previewAction(c.actionId, typed);
          if (effectDifferences(oldEffects, p.ok ? p.effects : NO_EFFECTS).length === 0) {
            await keep.performAction(c.actionId, typed);
            return true;
          }
        }
        return false;
      };
      type Outcome = Pick<
        CaseResult,
        'outcome' | 'old' | 'vessel' | 'screen' | 'differences' | 'reason'
      >;
      const attempt = async (c: ProofCase): Promise<Outcome> => {
        const preview = await vessel.previewAction(c.actionId, c.inputs);
        if (!preview.ok) {
          const why = preview.refused.map((r) => r.message).join('; ');
          // A rule of the Soul that cannot be worked out is a fault of the reborn app.
          if (preview.refused.some((r) => r.error))
            return { outcome: 'fail', reason: `The reborn app could not work it out: ${why}` };
          // A fix that refuses what the old app does: run on the old app and the old behaviour.
          if (keep && (await keep.previewAction(c.actionId, c.inputs)).ok) {
            const run = await old.run(c);
            since++;
            const differences = effectDifferences(run.effects, NO_EFFECTS);
            const ok = await explained(c, run.effects);
            return {
              outcome: ok ? 'accepted' : 'fail',
              old: run.effects,
              vessel: NO_EFFECTS,
              ...(run.screen ? { screen: run.screen } : {}),
              ...(differences.length ? { differences } : {}),
              reason: `The reborn app refuses it: ${why}`,
            };
          }
          // The records no longer allow it (the stock ran out): neither side runs it.
          return { outcome: 'skip', reason: why };
        }
        const run = await old.run(c);
        const done = await vessel.performAction(c.actionId, c.inputs);
        const effects = done.ok ? done.effects : NO_EFFECTS;
        const differences = effectDifferences(run.effects, effects);
        // The old behaviour keeps step with the old app on every case, so it can explain the next.
        const ok = keep ? await explained(c, run.effects) : false;
        since++;
        return {
          outcome: differences.length ? (ok ? 'accepted' : 'fail') : 'pass',
          old: run.effects,
          vessel: effects,
          ...(run.screen ? { screen: run.screen } : {}),
          ...(differences.length ? { differences } : {}),
        };
      };
      for (let index = lane; index < cases.length; index += lanes) {
        opts.signal?.throwIfAborted();
        if (since >= restartEvery) await restart();
        const c = cases[index]!;
        const before = await opts.reuse?.(c, index);
        if (before) {
          const result: CaseResult = { ...before, index, lane, ms: 0, reused: true };
          results.push(result);
          await opts.onCase?.(result);
          continue;
        }
        const start = Date.now();
        let outcome: Outcome;
        for (let tries = 0; ; tries++) {
          try {
            outcome = await attempt(c);
            break;
          } catch (e) {
            opts.signal?.throwIfAborted();
            // The old app could not be driven (a screen it did not reach): where it is now is not
            // known, so both start again, and the case is tried once more from there.
            await restart();
            if (tries >= 1) {
              outcome = { outcome: 'fail', reason: `The old app could not run it: ${message(e)}` };
              break;
            }
          }
        }
        // After a difference the two sides hold different records: both start again.
        if ((outcome.outcome === 'fail' || outcome.outcome === 'accepted') && outcome.differences)
          await restart();
        const result: CaseResult = {
          index,
          lane,
          actionId: c.actionId,
          inputs: c.inputs,
          ...(c.run !== undefined ? { run: c.run } : {}),
          ...outcome,
          ms: Date.now() - start,
        };
        results.push(result);
        await opts.onCase?.(result);
      }
    });

  await Promise.all(Array.from({ length: lanes }, (_, lane) => runLane(lane)));
  results.sort((a, b) => a.index - b.index);
  const count = (o: CaseOutcome) => results.filter((r) => r.outcome === o).length;
  return {
    seed: opts.seed,
    numRuns: cases.length,
    lanes,
    passed: count('pass'),
    failed: count('fail'),
    skipped: count('skip'),
    accepted: count('accepted'),
    reused: results.filter((r) => r.reused).length,
    cases: results,
    firstFailure: results.find((r) => r.outcome === 'fail') ?? null,
  };
}

/**
 * A Vessel standing in for the old app (tests, and a Soul checked against itself): it performs
 * each case on its own copy of the records. A refused case changes nothing, as in the old app.
 */
export function vesselOldApp(
  soul: Soul,
  records: Record<string, DbfRecord[]>,
  today: string,
): OldApp {
  let vessel: Promise<Vessel> = freshVessel(soul, records, today);
  return {
    async run(c) {
      const r = await (await vessel).performAction(c.actionId, c.inputs);
      return {
        effects: r.ok ? r.effects : NO_EFFECTS,
      };
    },
    async reset() {
      vessel = freshVessel(soul, records, today);
      await vessel;
    },
  };
}
