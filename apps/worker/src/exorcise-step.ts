// The exorcise step (Prompt 73): the Exorcist reads the project's newest Soul, everything the
// Possessor saw the old app do, and the old app's data files, and finds the legacy bugs. Where
// one recorded case cannot tell two explanations apart (a late fee), it types payments into the
// old app booted at chosen DOS dates and lets the old app's fees decide. Each finding is kept in
// `exorcisms` (a decision the owner already made is never undone) and sent as an `exorcism` event.
import {
  exorcise,
  lateFeePlan,
  loadGraph,
  type ExorcistInput,
  type LateFeeResult,
  type ObservedStep,
} from '@afterlife/crew';
import type { SnapshotDiff } from '@afterlife/dbf';
import {
  and,
  asc,
  desc,
  eq,
  exorcisms,
  inArray,
  observations,
  souls,
  type Db,
} from '@afterlife/db';
import { emulatorOldApp, type ProofCase } from '@afterlife/oracle';
import { SoulSchema, type Soul } from '@afterlife/soul';
import { tablesFromBundle } from '@afterlife/vessel';
import { graveyardDosTime, type EmulatorPool } from './possess';
import { graphOf } from './prove-step';
import type { StepContext, StepHandler } from './registry';

/** Types one case into the old app booted at `dosTime`; gives what it did to the data files. */
export type ProbeTyper = (soul: Soul, c: ProofCase, dosTime: string) => Promise<SnapshotDiff>;

export type ExorciseDeps = {
  db: Db;
  pool?: EmulatorPool;
  bundleFor: (p: StepContext['project'], projectId: string) => Promise<Uint8Array | null>;
  /** Tests give a fake old app; by default a fresh emulator from the pool, at the probe's date. */
  typeProbe?: ProbeTyper;
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

export function exorciseStep(deps: ExorciseDeps): StepHandler {
  return async (ctx) => {
    const [row] = await deps.db
      .select({ id: souls.id, version: souls.version, ir: souls.ir })
      .from(souls)
      .where(eq(souls.projectId, ctx.projectId))
      .orderBy(desc(souls.version))
      .limit(1);
    if (!row) return { status: 'skipped', reason: 'This project has no Soul yet' };
    const soul = SoulSchema.parse(row.ir);
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    const records = bundle
      ? Object.fromEntries(
          Object.entries(tablesFromBundle(bundle, soul)).map(([f, t]) => [
            f.toUpperCase(),
            t.records,
          ]),
        )
      : {};
    const seen = await deps.db
      .select({
        id: observations.id,
        keys: observations.keys,
        screenBefore: observations.screenBefore,
        screenAfter: observations.screenAfter,
        dbfDiff: observations.dbfDiff,
      })
      .from(observations)
      .where(eq(observations.projectId, ctx.projectId))
      .orderBy(asc(observations.seq));
    const dosTime = ctx.project.dosTime ?? graveyardDosTime(ctx.project);
    const input: ExorcistInput = {
      soul,
      records,
      observations: seen as ObservedStep[],
      today: (dosTime ?? new Date().toISOString()).slice(0, 10),
    };
    await ctx.log(
      `Looking for legacy bugs in Soul version ${row.version}: ${seen.length} observations, ${
        Object.keys(records).length
      } data files`,
    );

    // The late fee: typed into the old app at the dates that tell the ways of counting apart.
    const plan = lateFeePlan(input);
    const typer = deps.typeProbe ?? (deps.pool && bundle ? poolTyper(deps, bundle, ctx) : null);
    const results: LateFeeResult[] = [];
    if (plan && typer) {
      const entity = soul.entities.find((e) => e.id === plan.entity)!;
      for (const date of plan.probes) {
        ctx.signal.throwIfAborted();
        const at = `${date} 10:00:00`;
        try {
          const diff = await typer(soul, { actionId: plan.actionId, inputs: plan.inputs }, at);
          const r = diff.tables[entity.file]?.inserted[0];
          const lateFee = r ? str(r.values[plan.field]) || null : null;
          results.push({ date, lateFee, ref: `probe ${at}` });
          await ctx.log(
            lateFee === null
              ? `Probe: paid on ${date}, the old app saved no ${entity.name.toLowerCase()}`
              : `Probe: paid on ${date}, the old app charged a late fee of Rs ${lateFee}`,
          );
        } catch (e) {
          ctx.signal.throwIfAborted();
          results.push({ date, lateFee: null, ref: `probe ${at}` });
          await ctx.log(`Probe on ${date} could not be typed: ${(e as Error).message}`, 'warn');
        }
      }
    } else if (plan) await ctx.log('A late fee to probe, but no emulator to type it in', 'warn');

    const findings = exorcise(input, plan ? { plan, results } : undefined);
    // Kept per project by code: a new run updates what it says, never the owner's decision.
    for (const f of findings) {
      const evidence = {
        smell: f.smell,
        target: f.target ?? null,
        en: f.en,
        ur: f.ur,
        since: f.since,
        evidence: f.evidence,
      };
      await deps.db
        .insert(exorcisms)
        .values({
          projectId: ctx.projectId,
          soulId: row.id,
          code: f.code,
          severity: f.severity,
          titleEn: f.titleEn,
          titleUr: f.titleUr,
          evidence,
        })
        .onConflictDoUpdate({
          target: [exorcisms.projectId, exorcisms.code],
          set: {
            soulId: row.id,
            severity: f.severity,
            titleEn: f.titleEn,
            titleUr: f.titleUr,
            evidence,
          },
        });
      await ctx.emit('exorcism', {
        code: f.code,
        smell: f.smell,
        severity: f.severity,
        target: f.target ?? null,
        titleEn: f.titleEn,
        titleUr: f.titleUr,
        since: f.since,
      });
    }
    // A pending finding this run no longer sees goes; a decided one stays, as the owner chose.
    const codes = findings.map((f) => f.code);
    const stale = (
      await deps.db
        .select({ id: exorcisms.id, code: exorcisms.code })
        .from(exorcisms)
        .where(and(eq(exorcisms.projectId, ctx.projectId), eq(exorcisms.decision, 'pending')))
    ).filter((x) => !codes.includes(x.code));
    if (stale.length)
      await deps.db.delete(exorcisms).where(
        inArray(
          exorcisms.id,
          stale.map((x) => x.id),
        ),
      );
    await ctx.log(
      findings.length
        ? `${findings.length} legacy ${findings.length === 1 ? 'bug' : 'bugs'} found: ${findings
            .map((f) => `${f.titleEn} (${f.severity})`)
            .join('; ')}`
        : 'No legacy bug found',
      findings.some((f) => f.severity === 'high' || f.severity === 'critical') ? 'warn' : 'info',
    );
    return {
      status: 'done',
      output: { soulVersion: row.version, findings, probes: results },
    };
  };
}

/** The old app from the pool, booted at the probe's DOS date, driven to the action and typed. */
function poolTyper(deps: ExorciseDeps, bundle: Uint8Array, ctx: StepContext): ProbeTyper {
  return async (soul, c, dosTime) => {
    const graph = graphOf(soul, await loadGraph(deps.db, ctx.projectId));
    return deps.pool!.use(
      bundle,
      async (emu) => (await emulatorOldApp(emu, { soul, graph }).run(c)).effects,
      { dosTime },
    );
  };
}
