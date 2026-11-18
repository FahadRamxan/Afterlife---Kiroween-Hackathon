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
  pipelineSteps,
  projectEvents,
  projects,
  type Db,
  type JobType,
} from '@afterlife/db';
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

export const RecordingSchema = z.object({
  app: z.string(),
  recordedAt: z.iso.datetime(),
  /** How it was made, for the "recorded run" label. */
  source: z.literal('pnpm pipeline:record'),
  steps: z.array(RecordedStep).length(PIPELINE.length),
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
export function replayStep(rec: Recording, step: JobType): StepHandler {
  return async (ctx) => {
    const s = rec.steps.find((x) => x.step === step);
    if (!s) return { status: 'skipped', reason: `The recorded run has no ${step} step` };
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
  return RecordingSchema.parse({
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
