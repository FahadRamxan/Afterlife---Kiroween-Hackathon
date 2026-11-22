// The prove step (Prompt 70): the Oracle proves the reborn app does what the old app did. It runs
// fast-check cases made up from the project's newest Soul on lanes of the old app (headless js-dos,
// driven by the Possessor's screen graph and the actions' macros) and the Vessel, compares every
// case, and emits a `proof_case` event for each for the Proof tab. The first difference is shrunk
// and explained. The run and its cases are kept in proof_runs and proof_cases (the certificate,
// Prompt 71, is issued from them). Differences are a finding, not a failure of the step.
import type { SigningKey } from '@afterlife/certificate';
import { loadGraph, type ScreenGraphJson } from '@afterlife/crew';
import type { DbfRecord, SnapshotDiff } from '@afterlife/dbf';
import { and, desc, eq, proofCases, proofRuns, souls, type Db } from '@afterlife/db';
import {
  emulatorOldApp,
  proveEquivalence,
  shrinkFailure,
  type CaseResult,
  type OldApp,
  type ProofTarget,
} from '@afterlife/oracle';
import { SoulSchema, type Soul } from '@afterlife/soul';
import { tablesFromBundle } from '@afterlife/vessel';
import { graveyardDosTime, type EmulatorPool } from './possess';
import { issueCertificate } from './certify';
import type { StepContext, StepHandler } from './registry';

/** Cases per proof (PROVE_CASES): enough to cover each rule, short enough for a demo. */
export const DEFAULT_PROVE_CASES = 50;
/** Old apps at once (PROVE_LANES). */
export const DEFAULT_PROVE_LANES = 2;
/** At most this long shrinking the first difference (PROVE_SHRINK_MS). */
export const DEFAULT_SHRINK_MS = 60_000;
/** Differences kept per case in an event (the step's output and proof_cases have them all). */
const MAX_EVENT_DIFFERENCES = 20;

/** The project's seed: the same project proves the same cases again (its first 8 hex digits). */
export const seedOf = (projectId: string) => parseInt(projectId.replace(/-/g, '').slice(0, 8), 16);

/** The record the case wrote (the bill), as one side wrote it: what the Proof tab shows. */
function writtenRecord(soul: Soul, actionId: string, d: SnapshotDiff | undefined) {
  const action = soul.actions.find((a) => a.id === actionId);
  const entity = soul.entities.find(
    (e) => e.id === action?.effects.find((x) => x.kind === 'insert')?.entity,
  );
  const values = entity ? d?.tables[entity.file]?.inserted[0]?.values : undefined;
  return values
    ? Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null ? '' : String(v)]))
    : null;
}

/** The screen graph the Possessor mapped, with the Soul's own navigation added. */
function graphOf(soul: Soul, mapped: ScreenGraphJson | null) {
  const nodes = new Map((mapped?.nodes ?? []).map((n) => [n.fingerprint, n]));
  for (const s of soul.screens)
    if (!nodes.has(s.id))
      nodes.set(s.id, { fingerprint: s.id, title: s.title, firstSeen: 0, visits: 1 });
  const edges = [...(mapped?.edges ?? [])];
  for (const s of soul.screens)
    for (const n of s.navigation)
      if (!edges.some((e) => e.from === s.id && e.to === n.to && e.keys === n.keys))
        edges.push({ from: s.id, to: n.to, keys: n.keys, count: 1 });
  return { nodes: [...nodes.values()], edges };
}

export type ProveDeps = {
  db: Db;
  /** Signs the Rebirth Certificate (CERT_SIGNING_KEY); null: none is issued, and it says so. */
  key?: SigningKey | null;
  pool?: EmulatorPool;
  bundleFor: (p: StepContext['project'], projectId: string) => Promise<Uint8Array | null>;
  numRuns?: number;
  lanes?: number;
  shrinkMs?: number;
  /** The old app (tests give a Vessel); by default an emulator from the pool, booted fresh. */
  oldApp?: (
    soul: Soul,
    records: Record<string, DbfRecord[]>,
    today: string,
  ) => ProofTarget['withOldApp'];
};

export function proveStep(deps: ProveDeps): StepHandler {
  return async (ctx) => {
    const [row] = await deps.db
      .select({ id: souls.id, version: souls.version, ir: souls.ir })
      .from(souls)
      .where(eq(souls.projectId, ctx.projectId))
      .orderBy(desc(souls.version))
      .limit(1);
    if (!row) return { status: 'skipped', reason: 'This project has no Soul yet' };
    const soul = SoulSchema.parse(row.ir);
    if (!soul.actions.length)
      return { status: 'skipped', reason: 'The Soul has no actions to prove yet' };
    if (!deps.pool && !deps.oldApp)
      return { status: 'skipped', reason: 'This worker has no emulator to run the old app in' };
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle) return { status: 'skipped', reason: 'There is no old app for this project yet' };
    const dosTime = ctx.project.dosTime ?? graveyardDosTime(ctx.project);
    const today = (dosTime ?? new Date().toISOString()).slice(0, 10);
    const records = Object.fromEntries(
      Object.entries(tablesFromBundle(bundle, soul)).map(([f, t]) => [f.toUpperCase(), t.records]),
    );
    let withOldApp: ProofTarget['withOldApp'];
    if (deps.oldApp) withOldApp = deps.oldApp(soul, records, today);
    else {
      const graph = graphOf(soul, await loadGraph(deps.db, ctx.projectId));
      const pool = deps.pool!;
      withOldApp = <R>(work: (old: OldApp) => Promise<R>) =>
        pool.use(
          bundle,
          (emu) => work(emulatorOldApp(emu, { soul, graph })),
          dosTime ? { dosTime } : {},
        );
    }
    const target: ProofTarget = { soul, records, today, withOldApp };
    const numRuns = deps.numRuns ?? DEFAULT_PROVE_CASES;
    const lanes = deps.lanes ?? DEFAULT_PROVE_LANES;
    const seed = seedOf(ctx.projectId);
    const [run] = await deps.db
      .insert(proofRuns)
      .values({ projectId: ctx.projectId, soulId: row.id, seed, caseCount: numRuns })
      .returning({ id: proofRuns.id });
    await ctx.log(
      `Proving Soul version ${row.version}: ${numRuns} cases on ${lanes} lanes, seed ${seed}`,
    );
    // Running totals ride on every event: the page keeps only the newest events.
    const tally = { done: 0, failed: 0, skipped: 0 };
    const save = async (c: CaseResult) => {
      tally.done++;
      if (c.outcome === 'fail') tally.failed++;
      if (c.outcome === 'skip') tally.skipped++;
      await deps.db.insert(proofCases).values({
        proofRunId: run!.id,
        idx: c.index,
        input: { actionId: c.actionId, inputs: c.inputs },
        oldOutput: c.old ?? {},
        newOutput: c.vessel ?? {},
        passed: c.outcome !== 'fail',
        ...(c.reason ? { explanation: c.reason } : {}),
      });
      await ctx.emit('proof_case', {
        index: c.index,
        of: numRuns,
        ...tally,
        lane: c.lane,
        actionId: c.actionId,
        inputs: c.inputs,
        outcome: c.outcome,
        ...(c.reason ? { reason: c.reason } : {}),
        ...(c.differences ? { differences: c.differences.slice(0, MAX_EVENT_DIFFERENCES) } : {}),
        ...(c.screen ? { screen: c.screen } : {}),
        old: writtenRecord(soul, c.actionId, c.old),
        vessel: writtenRecord(soul, c.actionId, c.vessel),
        ms: c.ms,
      });
    };
    const r = await proveEquivalence(target, {
      numRuns,
      seed,
      lanes,
      onCase: save,
      signal: ctx.signal,
    });
    let counterexample = null;
    // The first case that differed in its effects is the one shrunk (a case the reborn app could
    // not work out at all has nothing to shrink).
    const first = r.cases.find((c) => c.outcome === 'fail' && c.differences) ?? r.firstFailure;
    if (first?.differences) {
      await ctx.log(`Shrinking case ${first.index}, the first difference`);
      const cx = await shrinkFailure(target, first, {
        seed,
        timeLimitMs: deps.shrinkMs ?? DEFAULT_SHRINK_MS,
      });
      counterexample = {
        index: first.index,
        actionId: cx.actionId,
        inputs: cx.inputs,
        seed: cx.seed,
        path: cx.path,
        explanation: cx.explanation,
        differences: cx.differences,
        shrinks: cx.shrinks,
        tries: cx.tries,
        reproduced: cx.reproduced,
        old: writtenRecord(soul, cx.actionId, cx.old),
        vessel: writtenRecord(soul, cx.actionId, cx.vessel),
      };
      await deps.db
        .update(proofCases)
        .set({ shrunk: cx, explanation: cx.explanation })
        .where(and(eq(proofCases.proofRunId, run!.id), eq(proofCases.idx, first.index)));
      await ctx.log(`Counterexample: ${cx.explanation}`, 'warn');
    } else if (first) {
      await ctx.log(`Case ${first.index}: ${first.reason}`, 'warn');
    }
    await deps.db
      .update(proofRuns)
      .set({
        status: r.failed ? 'failed' : 'passed',
        passed: r.passed,
        failed: r.failed,
        finishedAt: new Date(),
      })
      .where(eq(proofRuns.id, run!.id));
    await ctx.log(
      `${r.numRuns} cases: ${r.passed} the same, ${r.failed} different, ${r.skipped} skipped`,
      r.failed ? 'warn' : 'info',
    );
    // The Rebirth Certificate (Prompt 71): only when the proof holds on migrated data.
    const cert = await issueCertificate(deps.db, {
      project: { id: ctx.projectId, ...ctx.project },
      soul: { id: row.id, version: row.version, ir: row.ir },
      run: { id: run!.id, seed },
      proof: r,
      key: deps.key ?? null,
    });
    await ctx.log(
      cert.issued
        ? `Rebirth Certificate issued: ${cert.id}`
        : `No Rebirth Certificate: ${cert.reason}`,
      cert.issued ? 'info' : 'warn',
    );
    return {
      status: 'done',
      output: {
        soulVersion: row.version,
        proofRunId: run!.id,
        seed,
        numRuns: r.numRuns,
        lanes: r.lanes,
        passed: r.passed,
        failed: r.failed,
        skipped: r.skipped,
        counterexample,
        certificate: cert.issued ? { id: cert.id } : { reason: cert.reason },
      },
    };
  };
}
