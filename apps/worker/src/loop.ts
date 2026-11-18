// The worker's job loop (Prompt 37): one pg-boss worker per job type. Each attempt marks its
// project step running, runs the handler under a timeout, saves the output, and writes progress
// events. A failed attempt is retried by pg-boss up to the type's retry limit.
import {
  JOB_OPTIONS,
  JOB_TYPES,
  JobDataSchema,
  emitEvent,
  pipelineSteps,
  projects,
  type Db,
  type JobOptions,
  type JobType,
  and,
  eq,
  sql,
} from '@afterlife/db';
import type { Job, PgBoss } from 'pg-boss';
import type { Registry, StepContext } from './registry';

export type JobLoop = { stop(): Promise<void> };

type LoopOptions = {
  db: Db;
  boss: PgBoss;
  registry: Registry;
  /** Overrides of JOB_OPTIONS (tests use short timeouts). Must match ensureQueues. */
  options?: Partial<Record<JobType, Partial<JobOptions>>>;
  pollingIntervalSeconds?: number;
  log?: (line: string) => void;
};

export class StepTimeout extends Error {
  override name = 'StepTimeout';
}

/** The project's status from its steps: failed, running, or done once all six are settled. */
async function refreshProjectStatus(db: Db, projectId: string) {
  await db.execute(sql`
    UPDATE ${projects} SET updated_at = now(), status = (
      SELECT CASE
        WHEN bool_or(s.status = 'failed') THEN 'failed'
        WHEN bool_or(s.status IN ('queued', 'running')) THEN 'running'
        WHEN count(*) FILTER (WHERE s.status IN ('done', 'skipped') AND s.step IN
          ('possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise')) = 6 THEN 'done'
        ELSE 'created' END::project_status
      FROM ${pipelineSteps} s WHERE s.project_id = ${projectId})
    WHERE id = ${projectId}`);
}

/** Runs `fn` until it settles, the timeout passes, or `outer` aborts. */
async function withTimeout<T>(
  seconds: number,
  outer: AbortSignal,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(
    () => ac.abort(new StepTimeout(`timed out after ${seconds} s`)),
    seconds * 1000,
  );
  const onOuter = () => ac.abort(outer.reason ?? new Error('the worker is stopping'));
  outer.addEventListener('abort', onOuter, { once: true });
  try {
    return await Promise.race([
      fn(ac.signal),
      new Promise<never>((_, reject) =>
        ac.signal.addEventListener('abort', () => reject(ac.signal.reason), { once: true }),
      ),
    ]);
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', onOuter);
  }
}

async function runJob(o: LoopOptions, type: JobType, job: Job<unknown>) {
  const { db, registry } = o;
  const opts = { ...JOB_OPTIONS[type], ...o.options?.[type] };
  const data = JobDataSchema.parse(job.data);
  const where = and(eq(pipelineSteps.projectId, data.projectId), eq(pipelineSteps.step, type));
  const emit = async (t: Parameters<StepContext['emit']>[0], payload: unknown) => {
    await emitEvent(db, data.projectId, t, payload);
  };
  const log: StepContext['log'] = (message, level = 'info') => emit('log', { level, message });

  const [row] = await db.select().from(pipelineSteps).where(where);
  // Idempotent: a duplicate delivery of a finished step does nothing (unless forced).
  if (row?.status === 'done' && !data.force) {
    await log(`${type} is already done; not run again`);
    return { alreadyDone: true };
  }
  const attempt = (row?.attempts ?? 0) + 1;
  await db
    .insert(pipelineSteps)
    .values({ projectId: data.projectId, step: type, status: 'running', attempts: attempt })
    .onConflictDoUpdate({
      target: [pipelineSteps.projectId, pipelineSteps.step],
      set: {
        status: 'running',
        attempts: attempt,
        jobId: job.id,
        error: null,
        startedAt: sql`now()`,
        finishedAt: null,
        updatedAt: sql`now()`,
      },
    });
  await refreshProjectStatus(db, data.projectId);
  await emit('step', { step: type, state: 'started', attempt });

  try {
    const result = await withTimeout(opts.timeoutSeconds, job.signal, (signal) =>
      registry[type]({
        projectId: data.projectId,
        step: type,
        attempt,
        force: !!data.force,
        signal,
        emit,
        log,
      }),
    );
    const output = result.status === 'done' ? result.output : { reason: result.reason };
    await db
      .update(pipelineSteps)
      .set({
        status: result.status,
        output: output ?? null,
        finishedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(where);
    await emit('step', {
      step: type,
      state: result.status,
      attempt,
      ...(result.status === 'skipped' ? { message: result.reason } : {}),
    });
    await refreshProjectStatus(db, data.projectId);
    return output;
  } catch (e) {
    const message = (e as Error)?.message ?? String(e);
    const retrying = job.retryCount < opts.retryLimit;
    await db
      .update(pipelineSteps)
      .set({
        status: retrying ? 'queued' : 'failed',
        error: message,
        finishedAt: retrying ? null : sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(where);
    await emit('step', { step: type, state: retrying ? 'retrying' : 'failed', attempt, message });
    await refreshProjectStatus(db, data.projectId);
    o.log?.(`${type} ${data.projectId} attempt ${attempt} failed: ${message}`);
    // pg-boss records the failure and schedules the retry.
    throw e;
  }
}

export async function startJobLoop(o: LoopOptions): Promise<JobLoop> {
  for (const type of JOB_TYPES)
    await o.boss.work(
      type,
      { batchSize: 1, pollingIntervalSeconds: o.pollingIntervalSeconds ?? 2 },
      async ([job]) => (job ? runJob(o, type, job) : undefined),
    );
  return {
    async stop() {
      for (const type of JOB_TYPES) await o.boss.offWork(type, { wait: true });
    },
  };
}
