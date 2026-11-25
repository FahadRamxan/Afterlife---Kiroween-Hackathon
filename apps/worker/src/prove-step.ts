// The prove step (Prompt 70): the Oracle proves the reborn app does what the old app did. It runs
// fast-check cases made up from the project's newest Soul on lanes of the old app (headless js-dos,
// driven by the Possessor's screen graph and the actions' macros) and the Vessel, compares every
// case, and emits a `proof_case` event for each for the Proof tab. The first difference is shrunk
// and explained. The run and its cases are kept in proof_runs and proof_cases (the certificate,
// Prompt 71, is issued from them). Differences are a finding, not a failure of the step.
import type { SigningKey } from '@afterlife/certificate';
import { canonicalize } from '@afterlife/certificate';
import { loadGraph, undoFixes, type ScreenGraphJson, type StoredFinding } from '@afterlife/crew';
import type { DbfRecord, SnapshotDiff } from '@afterlife/dbf';
import {
  and,
  asc,
  desc,
  eq,
  exorcisms,
  ne,
  pipelineSteps,
  projects,
  proofCases,
  proofRuns,
  souls,
  type Db,
} from '@afterlife/db';
import {
  effectDifferences,
  emulatorOldApp,
  freshVessel,
  proveEquivalence,
  shrinkFailure,
  type CaseResult,
  type ProofCase,
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
/** The seed of every recorded project's proof (Prompt 81): the year Shifa was written. */
export const RECORDED_SEED = 1998;

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
export function graphOf(soul: Soul, mapped: ScreenGraphJson | null) {
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
    // Prove what was published (Prompt 81): the actions the Surgeon's smoke test passed. The others
    // are not reborn yet, and are listed with why, not counted as differences.
    const [rebirth] = await deps.db
      .select({ output: pipelineSteps.output })
      .from(pipelineSteps)
      .where(and(eq(pipelineSteps.projectId, ctx.projectId), eq(pipelineSteps.step, 'rebirth')));
    const surgeon = rebirth?.output as
      | {
          smoke?: {
            actionId: string;
            name: string;
            ok: boolean;
            error?: string;
            refused?: string[];
          }[];
          config?: { actions?: { id: string }[] } | null;
        }
      | undefined;
    const published = surgeon?.smoke
      ? new Set((surgeon.config?.actions ?? []).map((a) => a.id))
      : new Set(soul.actions.map((a) => a.id));
    const notReborn = (surgeon?.smoke ?? [])
      .filter((s) => !published.has(s.actionId))
      .map((s) => ({
        actionId: s.actionId,
        name: s.name,
        reason: s.error ?? `Its smoke test was refused (${(s.refused ?? []).join('; ')})`,
      }));
    for (const n of notReborn)
      await ctx.log(`Not reborn yet, so not proved: ${n.name}. ${n.reason}`);
    const [{ mode } = { mode: 'live' }] = await deps.db
      .select({ mode: projects.mode })
      .from(projects)
      .where(eq(projects.id, ctx.projectId));
    // A recorded run (demo mode) proves with one seed, so the demo and the e2e give the same answer.
    const seed = mode === 'recorded' ? RECORDED_SEED : seedOf(ctx.projectId);
    if (!published.size)
      return {
        status: 'done',
        output: {
          soulVersion: row.version,
          seed,
          numRuns: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          lanes: 0,
          notReborn,
          certificate: { reason: 'No action is reborn yet, so there is nothing to prove' },
        },
      };
    const provable: Soul = { ...soul, actions: soul.actions.filter((a) => published.has(a.id)) };
    let withOldApp: ProofTarget['withOldApp'];
    if (deps.oldApp) withOldApp = deps.oldApp(provable, records, today);
    else {
      const graph = graphOf(soul, await loadGraph(deps.db, ctx.projectId));
      const pool = deps.pool!;
      withOldApp = <R>(work: (old: OldApp) => Promise<R>) =>
        pool.use(
          bundle,
          (emu) => work(emulatorOldApp(emu, { soul: provable, graph })),
          dosTime ? { dosTime } : {},
        );
    }
    const target: ProofTarget = { soul: provable, records, today, withOldApp };
    // The owner's fixes (Prompt 74): with them undone the Soul does what the old app does, so the
    // Oracle runs it alongside and accepts the differences it explains.
    const fixes = (
      await deps.db
        .select({ code: exorcisms.code, evidence: exorcisms.evidence })
        .from(exorcisms)
        .where(and(eq(exorcisms.projectId, ctx.projectId), eq(exorcisms.decision, 'fix')))
        .orderBy(asc(exorcisms.decidedAt))
    ).flatMap((x) => {
      const remedy = (x.evidence as StoredFinding).remedy;
      return remedy?.fix ? [{ code: x.code, remedy }] : [];
    });
    const oldBehaviour = fixes.length
      ? undoFixes(
          provable,
          fixes.map((f) => f.remedy),
        )
      : undefined;
    const acceptedDivergences = fixes.map((f) => ({ id: f.code, text: f.remedy.fixEn }));
    const numRuns = deps.numRuns ?? DEFAULT_PROVE_CASES;
    const lanes = deps.lanes ?? DEFAULT_PROVE_LANES;
    const [run] = await deps.db
      .insert(proofRuns)
      .values({ projectId: ctx.projectId, soulId: row.id, seed, caseCount: numRuns })
      .returning({ id: proofRuns.id });
    await ctx.log(
      `Proving Soul version ${row.version}: ${numRuns} cases on ${lanes} lanes, seed ${seed}`,
    );
    const reuse = await reuseFrom(deps.db, ctx.projectId, run!.id, seed, provable, target);
    if (reuse) await ctx.log(`Cases the change does not touch keep the outcome of the last proof`);
    // Running totals ride on every event: the page keeps only the newest events.
    const tally = { done: 0, failed: 0, skipped: 0, accepted: 0 };
    const save = async (c: CaseResult) => {
      tally.done++;
      if (c.outcome === 'fail') tally.failed++;
      if (c.outcome === 'skip') tally.skipped++;
      if (c.outcome === 'accepted') tally.accepted++;
      await deps.db.insert(proofCases).values({
        proofRunId: run!.id,
        idx: c.index,
        input: { actionId: c.actionId, inputs: c.inputs, outcome: c.outcome },
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
        ...(c.reused ? { reused: true } : {}),
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
      ...(oldBehaviour ? { oldBehaviour } : {}),
      ...(reuse ? { reuse } : {}),
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
      `${r.numRuns} cases: ${r.passed} the same, ${r.failed} different, ${r.skipped} skipped` +
        (r.accepted ? `, ${r.accepted} accepted (the owner's fixes)` : '') +
        (r.reused ? `; ${r.reused} kept from the last proof` : ''),
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
        accepted: r.accepted,
        reused: r.reused,
        acceptedDivergences,
        counterexample,
        notReborn,
        certificate: cert.issued ? { id: cert.id } : { reason: cert.reason },
      },
    };
  };
}

/**
 * The last proof's cases, reused where nothing changed for them (Prompt 74: a fixed rule re-runs
 * the affected proof cases only). Only from a proof of a Soul with the same data files, with the
 * same seed; a case is reused when it is the same case, it held then (the same or skipped), and
 * the Soul then and now do the same with it from a fresh start.
 */
async function reuseFrom(
  db: Db,
  projectId: string,
  runId: string,
  seed: number,
  soul: Soul,
  target: ProofTarget,
): Promise<
  | ((c: ProofCase, index: number) => Promise<Omit<CaseResult, 'index' | 'lane' | 'ms'> | null>)
  | null
> {
  const [last] = await db
    .select({ id: proofRuns.id, soulId: proofRuns.soulId, seed: proofRuns.seed })
    .from(proofRuns)
    .where(
      and(
        eq(proofRuns.projectId, projectId),
        ne(proofRuns.id, runId),
        ne(proofRuns.status, 'running'),
      ),
    )
    .orderBy(desc(proofRuns.startedAt))
    .limit(1);
  if (!last || last.seed !== seed) return null;
  const [then] = await db.select({ ir: souls.ir }).from(souls).where(eq(souls.id, last.soulId));
  const before = then ? SoulSchema.safeParse(then.ir) : null;
  if (!before?.success || canonicalize(before.data.entities) !== canonicalize(soul.entities))
    return null;
  const rows = await db.select().from(proofCases).where(eq(proofCases.proofRunId, last.id));
  const byIdx = new Map(rows.map((x) => [x.idx, x]));
  const [was, now] = await Promise.all([
    freshVessel(before.data, target.records, target.today),
    freshVessel(soul, target.records, target.today),
  ]);
  const same = async (c: ProofCase) => {
    const [a, b] = await Promise.all([
      was.previewAction(c.actionId, c.inputs),
      now.previewAction(c.actionId, c.inputs),
    ]);
    if (a.ok !== b.ok) return false;
    return a.ok && b.ok ? effectDifferences(a.effects, b.effects).length === 0 : true;
  };
  return async (c: ProofCase, index: number) => {
    const x = byIdx.get(index);
    const input = x?.input as { actionId?: string; inputs?: unknown; outcome?: string } | undefined;
    if (!x || !input || (input.outcome !== 'pass' && input.outcome !== 'skip')) return null;
    if (
      canonicalize({ actionId: input.actionId, inputs: input.inputs }) !==
      canonicalize({ actionId: c.actionId, inputs: c.inputs })
    )
      return null;
    if (!(await same(c))) return null;
    return {
      actionId: c.actionId,
      inputs: c.inputs,
      outcome: input.outcome,
      ...(input.outcome === 'pass'
        ? { old: x.oldOutput as SnapshotDiff, vessel: x.newOutput as SnapshotDiff }
        : {}),
      ...(x.explanation ? { reason: x.explanation } : {}),
    };
  };
}
