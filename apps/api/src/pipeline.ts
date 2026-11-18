// Raising a project starts its pipeline: the API queues the first step (possess) for the worker.
// The orchestrator that runs the rest (Prompt 39) lives in the worker.
import { createBoss, enqueueStep, ensureQueues, type Db } from '@afterlife/db';
import type { Pipeline } from './projects';

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

  async start(projectId: string): Promise<void> {
    await enqueueStep(this.boss, this.db, 'possess', { projectId });
  }

  async close(): Promise<void> {
    await this.boss.stop({ graceful: false });
  }
}
