// The job queue (Prompt 37): pg-boss on the same Postgres. One queue per job type. A project step
// is one job, keyed `<projectId>:<type>`, so the same step is never queued or run twice at once.
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import type { Db } from './client';
import { JOB_TYPES, pipelineSteps, type JobType } from './schema';

export const JobDataSchema = z.strictObject({
  projectId: z.uuid(),
  /** Run the step again even if it is already done (re-run one step alone, Prompt 39). */
  force: z.boolean().optional(),
});
export type JobData = z.infer<typeof JobDataSchema>;

export type JobOptions = {
  /** How many times a failed attempt is tried again. */
  retryLimit: number;
  /** Seconds before the first retry (doubled each time with backoff). */
  retryDelay: number;
  retryBackoff: boolean;
  /** An attempt that runs longer than this fails ("timed out"). */
  timeoutSeconds: number;
};

const MIN = 60;
/**
 * Per type. Possession and the proof drive the old app in js-dos, so they get the longest.
 * The LLM steps retry more (a model call can fail for a moment).
 */
export const JOB_OPTIONS: Record<JobType, JobOptions> = {
  possess: { retryLimit: 2, retryDelay: 30, retryBackoff: true, timeoutSeconds: 30 * MIN },
  archaeology: { retryLimit: 3, retryDelay: 15, retryBackoff: true, timeoutSeconds: 15 * MIN },
  rebirth: { retryLimit: 3, retryDelay: 15, retryBackoff: true, timeoutSeconds: 10 * MIN },
  undertake: { retryLimit: 2, retryDelay: 15, retryBackoff: true, timeoutSeconds: 10 * MIN },
  prove: { retryLimit: 1, retryDelay: 30, retryBackoff: true, timeoutSeconds: 60 * MIN },
  exorcise: { retryLimit: 3, retryDelay: 15, retryBackoff: true, timeoutSeconds: 10 * MIN },
  'twin-replay': { retryLimit: 2, retryDelay: 30, retryBackoff: true, timeoutSeconds: 30 * MIN },
  'voice-change': { retryLimit: 3, retryDelay: 10, retryBackoff: true, timeoutSeconds: 5 * MIN },
};

/** The idempotency key of a project step. */
export const stepKey = (projectId: string, type: JobType) => `${projectId}:${type}`;

/** A pg-boss instance on this database. Call `start()` before use and `stop()` at the end. */
export function createBoss(url: string, opts: { onError?: (e: Error) => void } = {}): PgBoss {
  // A small pool: the API and the worker share Neon's connection limit.
  const boss = new PgBoss({ connectionString: url, max: 3, application_name: 'afterlife-jobs' });
  boss.on('error', (e: Error) => opts.onError?.(e));
  return boss;
}

/**
 * Creates (or updates) a queue per job type. "stately": at most one job per key queued and one
 * active, so a double click on Raise does not run possession twice.
 */
export async function ensureQueues(
  boss: PgBoss,
  options: Partial<Record<JobType, Partial<JobOptions>>> = {},
): Promise<void> {
  for (const type of JOB_TYPES) {
    const o = { ...JOB_OPTIONS[type], ...options[type] };
    const queue = {
      policy: 'stately' as const,
      retryLimit: o.retryLimit,
      retryDelay: o.retryDelay,
      retryBackoff: o.retryBackoff,
      // pg-boss's own limit is a backstop a little after ours (the worker times out first).
      expireInSeconds: o.timeoutSeconds + 30,
    };
    if (await boss.getQueue(type)) {
      // The policy is fixed when a queue is made; the rest can change between deploys.
      const { retryLimit, retryDelay, retryBackoff, expireInSeconds } = queue;
      await boss.updateQueue(type, { retryLimit, retryDelay, retryBackoff, expireInSeconds });
    } else await boss.createQueue(type, queue);
  }
}

/**
 * Queues one project step and marks it `queued`. Returns the job id, or null when the same step
 * is already queued (the idempotency key held it back).
 */
export async function enqueueStep(
  boss: PgBoss,
  db: Db,
  type: JobType,
  data: JobData,
): Promise<string | null> {
  const parsed = JobDataSchema.parse(data);
  const id = await boss.send(type, parsed, { singletonKey: stepKey(parsed.projectId, type) });
  if (id)
    await db
      .insert(pipelineSteps)
      .values({ projectId: parsed.projectId, step: type, status: 'queued', jobId: id })
      .onConflictDoUpdate({
        target: [pipelineSteps.projectId, pipelineSteps.step],
        // A step that is done stays done unless it is forced to run again.
        set: parsed.force
          ? { status: 'queued', jobId: id, error: null, updatedAt: sql`now()` }
          : {
              status: sql`CASE WHEN ${pipelineSteps.status} = 'done' THEN 'done'::step_status ELSE 'queued'::step_status END`,
              jobId: id,
              updatedAt: sql`now()`,
            },
      });
  return id;
}
