// The pipeline orchestrator (Prompt 39): possess, archaeology, rebirth, undertake, prove,
// exorcise. runPipeline queues the first step; each step queues the next when it settles (loop.ts),
// so the pipeline lives in the queue and survives a worker restart. Every step saves its output in
// pipeline_steps: running the pipeline again resumes after the last step that is done, and a
// single step can be run again alone (rerunStep), which does not run the ones after it.
import {
  PIPELINE,
  enqueueStep,
  eq,
  pipelineSteps,
  projects,
  startPipeline,
  type Db,
  type PipelineStep,
} from '@afterlife/db';
import type { PgBoss } from 'pg-boss';

export function runPipeline(
  boss: PgBoss,
  db: Db,
  projectId: string,
  opts: { from?: PipelineStep } = {},
): Promise<string | null> {
  return startPipeline(boss, db, projectId, opts);
}

/** Runs one step again, alone: forced even if it is done, and the next steps are not queued. */
export function rerunStep(boss: PgBoss, db: Db, projectId: string, step: PipelineStep) {
  return enqueueStep(boss, db, step, { projectId, force: true });
}

export type PipelineState = {
  status: string;
  steps: {
    step: PipelineStep;
    status: string;
    attempts: number;
    output: unknown;
    error: string | null;
  }[];
};

export async function pipelineState(db: Db, projectId: string): Promise<PipelineState> {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  const rows = await db.select().from(pipelineSteps).where(eq(pipelineSteps.projectId, projectId));
  return {
    status: p?.status ?? 'missing',
    steps: PIPELINE.map((step) => {
      const r = rows.find((x) => x.step === step);
      return {
        step,
        status: r?.status ?? 'pending',
        attempts: r?.attempts ?? 0,
        output: r?.output ?? null,
        error: r?.error ?? null,
      };
    }),
  };
}

/** Waits until the project is done or failed (or the time runs out) and returns its state. */
export async function waitForPipeline(
  db: Db,
  projectId: string,
  timeoutMs: number,
): Promise<PipelineState> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const s = await pipelineState(db, projectId);
    if (s.status === 'done' || s.status === 'failed') return s;
    if (Date.now() > end)
      throw new Error(
        `The pipeline did not finish in ${timeoutMs / 1000} s: ${s.steps.map((x) => `${x.step}=${x.status}`).join(' ')}`,
      );
    await new Promise((r) => setTimeout(r, 250));
  }
}
