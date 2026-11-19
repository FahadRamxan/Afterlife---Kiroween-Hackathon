// Raising a project starts its pipeline (Prompt 39): the API queues the first step, and the
// worker's orchestrator runs the rest. The API also reads where the steps are and can run one
// step again alone.
import {
  PIPELINE,
  createBoss,
  enqueueStep,
  ensureQueues,
  eq,
  pipelineSteps,
  startPipeline,
  type Db,
  type PipelineStep,
} from '@afterlife/db';
import type { Pipeline, StepState } from './projects';

export class PgPipeline implements Pipeline {
  private constructor(
    private readonly db: Db,
    private readonly boss: ReturnType<typeof createBoss>,
  ) {}

  static async start(db: Db, url: string, log: { warn(msg: string): void }): Promise<PgPipeline> {
    // The API only sends jobs: no maintenance or schedules (the worker's pg-boss does those).
    const boss = createBoss(url, {
      background: false,
      onError: (e) => log.warn(`pg-boss: ${e.message}`),
    });
    await boss.start();
    // The worker makes the queues too; whichever starts first does it.
    await ensureQueues(boss);
    return new PgPipeline(db, boss);
  }

  async start(projectId: string, from: 'possess' | 'scan-upload' = 'possess'): Promise<void> {
    await startPipeline(this.boss, this.db, projectId, { from });
  }

  async steps(projectId: string): Promise<StepState[]> {
    const rows = await this.db
      .select()
      .from(pipelineSteps)
      .where(eq(pipelineSteps.projectId, projectId));
    return PIPELINE.map((step) => {
      const r = rows.find((x) => x.step === step);
      const output = (r?.output ?? null) as { reason?: unknown; recorded?: unknown } | null;
      const reason = typeof output?.reason === 'string' ? output.reason : null;
      return {
        step,
        status: r?.status ?? 'pending',
        attempts: r?.attempts ?? 0,
        error: r?.error ?? null,
        reason,
        recorded: !!output?.recorded || !!reason?.startsWith('Recorded run'),
        finishedAt: r?.finishedAt?.toISOString() ?? null,
      };
    });
  }

  async rerun(projectId: string, step: PipelineStep): Promise<boolean> {
    return (await enqueueStep(this.boss, this.db, step, { projectId, force: true })) !== null;
  }

  async translate(projectId: string): Promise<boolean> {
    return (
      (await enqueueStep(this.boss, this.db, 'translate-soul', { projectId, force: true })) !== null
    );
  }
  async close(): Promise<void> {
    await this.boss.stop({ graceful: false });
  }
}
