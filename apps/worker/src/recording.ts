// Demo mode (Prompt 39): a recorded run. `pnpm pipeline:record` runs the real pipeline on each
// Graveyard app and saves every step's output and events in recorded/<app>.json. A project in
// "recorded" mode replays them, faster, and every replayed step says it is a recorded run.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EVENT_TYPES,
  PIPELINE,
  SEED_PROJECTS,
  asc,
  eq,
  insertSoulVersion,
  latestSoulRow,
  observations,
  pipelineSteps,
  projectEvents,
  projects,
  type Db,
  type JobType,
} from '@afterlife/db';
import { saveGraph, type ScreenGraphJson } from '@afterlife/crew';
import { SoulSchema, numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import { z } from 'zod';
import type { StepHandler } from './registry';

const RecordedStep = z.object({
  step: z.enum(PIPELINE),
  status: z.enum(['done', 'skipped']),
  output: z.unknown(),
  /** What the step wrote, with the time since the step started. `step` events are not kept. */
  events: z.array(
    z.object({
      type: z.enum(EVENT_TYPES).exclude(['step']),
      payload: z.unknown(),
      afterMs: z.number().int().nonnegative(),
    }),
  ),
});

/** A screen as a recording keeps it: its text and title (enough for the evidence of a rule). */
const RecordedScreen = z.object({
  fingerprint: z.string(),
  text: z.array(z.string()),
  model: z.object({ title: z.object({ name: z.string() }).nullable() }).nullable(),
  cursor: z.unknown(),
});
const RecordedObservation = z.object({
  id: z.string(),
  seq: z.number().int().nonnegative(),
  keys: z.string(),
  screenBefore: RecordedScreen,
  screenAfter: RecordedScreen,
  dbfDiff: z.unknown(),
  durationMs: z.number().int().nonnegative(),
  stable: z.boolean(),
});
export const RecordingSchema = z.object({
  app: z.string(),
  recordedAt: z.iso.datetime(),
  /** How it was made, for the "recorded run" label. */
  source: z.literal('pnpm pipeline:record'),
  steps: z.array(RecordedStep).length(PIPELINE.length),
  /**
   * What the run left behind (review of 51-60): its observations, and the Soul the Archaeologist
   * wrote from them. A replay stores both, so a recorded project opens its Soul and reborn app.
   */
  observations: z.array(RecordedObservation).optional(),
  soul: z.unknown().optional(),
});
export type Recording = z.infer<typeof RecordingSchema>;

export const RECORDED_DIR = fileURLToPath(new URL('../recorded/', import.meta.url));
const GRAVEYARD = new Set<string>(SEED_PROJECTS.map((p) => p.sourceApp));

/** The recorded run of a Graveyard app, or null (no recording, or not a Graveyard app). */
export function loadRecording(app: string): Recording | null {
  if (!GRAVEYARD.has(app)) return null;
  const file = `${RECORDED_DIR}${app}.json`;
  if (!existsSync(file)) return null;
  return RecordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

/** The longest pause kept between replayed events: a recorded run is the fast way through. */
export const MAX_PAUSE_MS = 1500;

/** Replays one step of a recording: its events (paced, capped) and its output, marked recorded. */
export function replayStep(rec: Recording, step: JobType, db?: Db): StepHandler {
  return async (ctx) => {
    const s = rec.steps.find((x) => x.step === step);
    if (!s) return { status: 'skipped', reason: `The recorded run has no ${step} step` };
    if (db && step === 'possess' && rec.observations?.length)
      await keepObservations(db, ctx.projectId, rec);
    if (db && step === 'archaeology' && rec.soul) await keepSoul(db, ctx.projectId, rec);
    await ctx.log(`Recorded run from ${rec.recordedAt.slice(0, 10)}: replaying ${step}`);
    let at = 0;
    for (const e of s.events) {
      const wait = Math.min(Math.max(e.afterMs - at, 0), MAX_PAUSE_MS);
      at = e.afterMs;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      if (ctx.signal.aborted) throw ctx.signal.reason;
      await ctx.emit(e.type, e.payload);
    }
    const recorded = { recordedAt: rec.recordedAt };
    if (s.status === 'done')
      return { status: 'done', output: { ...(s.output as object), recorded } };
    const reason = (s.output as { reason?: string } | null)?.reason ?? 'skipped';
    return { status: 'skipped', reason: `Recorded run: ${reason}` };
  };
}

const slim = (s: unknown) => {
  const x = s as {
    fingerprint: string;
    text: string[];
    model?: { title?: { name?: string } | null } | null;
    cursor?: unknown;
  };
  return {
    fingerprint: x.fingerprint,
    text: x.text,
    model: x.model
      ? { title: x.model.title?.name !== undefined ? { name: x.model.title.name } : null }
      : null,
    cursor: x.cursor ?? null,
  };
};

/** The replay's observations, for this project (new ids; the seq ties them to the recording's). */
async function keepObservations(db: Db, projectId: string, rec: Recording) {
  const [has] = await db
    .select({ id: observations.id })
    .from(observations)
    .where(eq(observations.projectId, projectId))
    .limit(1);
  if (has) return;
  const rows = rec.observations!;
  for (let i = 0; i < rows.length; i += 200)
    await db.insert(observations).values(
      rows.slice(i, i + 200).map((o) => ({
        projectId,
        seq: o.seq,
        keys: o.keys,
        screenBeforeFp: o.screenBefore.fingerprint,
        screenAfterFp: o.screenAfter.fingerprint,
        screenBefore: o.screenBefore,
        screenAfter: o.screenAfter,
        dbfDiff: o.dbfDiff,
        durationMs: o.durationMs,
        stable: o.stable,
      })),
    );
  const graph = (
    rec.steps.find((x) => x.step === 'possess')?.output as { graph?: ScreenGraphJson } | null
  )?.graph;
  if (graph?.root) await saveGraph(db, projectId, graph);
}

/** The recorded Soul, as this project's next version: its evidence points at this project's rows. */
async function keepSoul(db: Db, projectId: string, rec: Recording) {
  const soul = SoulSchema.parse(rec.soul);
  const rows = await db
    .select({ id: observations.id, seq: observations.seq })
    .from(observations)
    .where(eq(observations.projectId, projectId));
  const bySeq = new Map(rows.map((r) => [r.seq, r.id]));
  const ids = new Map((rec.observations ?? []).map((o) => [o.id, bySeq.get(o.seq)]));
  const mapped: Soul = {
    ...soul,
    provenance: { ...soul.provenance, projectId },
    rules: soul.rules.map((r) => ({
      ...r,
      evidence: r.evidence.map((e) => ids.get(e)).filter((e): e is string => !!e),
    })),
  };
  await insertSoulVersion(db, projectId, (v, parent) => {
    const stored = numberSoul(mapped, projectId, v, parent);
    return { ir: stored, specMarkdown: specRequirements(stored) };
  });
}

/** Reads a finished pipeline run back as a recording (used by `pnpm pipeline:record`). */
export async function recordRun(db: Db, projectId: string): Promise<Recording> {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) throw new Error('No such project');
  const steps = await db.select().from(pipelineSteps).where(eq(pipelineSteps.projectId, projectId));
  const events = await db
    .select()
    .from(projectEvents)
    .where(eq(projectEvents.projectId, projectId))
    .orderBy(asc(projectEvents.seq));
  // Each step's events lie between its "started" event and the next step's.
  let current: string | null = null;
  let startedAt = 0;
  const byStep = new Map<string, Recording['steps'][number]['events']>();
  for (const e of events) {
    if (e.type === 'step') {
      const p = e.payload as { step: string; state: string };
      if (p.state === 'started') {
        current = p.step;
        startedAt = e.createdAt.getTime();
        byStep.set(current, []);
      }
      continue;
    }
    if (current)
      byStep.get(current)!.push({
        type: e.type as Exclude<(typeof EVENT_TYPES)[number], 'step'>,
        payload: e.payload,
        afterMs: Math.max(0, e.createdAt.getTime() - startedAt),
      });
  }
  const obs = await db
    .select()
    .from(observations)
    .where(eq(observations.projectId, projectId))
    .orderBy(asc(observations.seq));
  const soul = await latestSoulRow(db, projectId);
  return RecordingSchema.parse({
    observations: obs.map((o) => ({
      id: o.id,
      seq: o.seq,
      keys: o.keys,
      screenBefore: slim(o.screenBefore),
      screenAfter: slim(o.screenAfter),
      dbfDiff: o.dbfDiff,
      durationMs: o.durationMs,
      stable: o.stable,
    })),
    ...(soul ? { soul: soul.ir } : {}),
    app: p.sourceApp,
    recordedAt: new Date().toISOString(),
    source: 'pnpm pipeline:record',
    steps: PIPELINE.map((step) => {
      const row = steps.find((s) => s.step === step);
      if (!row || (row.status !== 'done' && row.status !== 'skipped'))
        throw new Error(`The run did not finish ${step} (${row?.status ?? 'not run'})`);
      return { step, status: row.status, output: row.output, events: byStep.get(step) ?? [] };
    }),
  });
}
