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
      const output = (r?.output ?? null) as {
        reason?: unknown;
        recorded?: unknown;
        soulVersion?: number;
        seed?: number;
        numRuns?: number;
        lanes?: number;
        passed?: number;
        failed?: number;
        skipped?: number;
        counterexample?: NonNullable<StepState['proof']>['counterexample'];
        certificate?: { id?: string; reason?: string };
        published?: unknown;
        actions?: { id: string; name: string; ok: boolean }[];
        tables?: {
          file: string;
          entity: string;
          read: number;
          deleted: number;
          migrated: number;
          rejected: number;
        }[];
        rejected?: { file: string; recno: number; field: string; reason: string; fix: string }[];
        reconciliation?: {
          matches: boolean;
          lines: {
            table: string;
            total: string;
            before: string;
            rejected: string;
            after: string;
            ok: boolean;
          }[];
        };
      } | null;
      const reason = typeof output?.reason === 'string' ? output.reason : null;
      return {
        step,
        status: r?.status ?? 'pending',
        attempts: r?.attempts ?? 0,
        error: r?.error ?? null,
        reason,
        recorded: !!output?.recorded || !!reason?.startsWith('Recorded run'),
        finishedAt: r?.finishedAt?.toISOString() ?? null,
        // The URL is this project's, also for a recorded run (its output has the recorded one's).
        vessel:
          step === 'rebirth' && r?.status === 'done' && output?.published === true
            ? {
                url: `/vessel/${projectId}`,
                actions: (output.actions ?? [])
                  .filter((a) => a.ok)
                  .map((a) => ({ id: a.id, name: a.name })),
              }
            : null,
        // At most 100 rejected records on the page; the step's output has them all.
        crossing:
          step === 'undertake' && r?.status === 'done' && output?.reconciliation && output.tables
            ? {
                tables: output.tables,
                rejected: (output.rejected ?? []).slice(0, 100).map((x) => ({
                  file: x.file,
                  recno: x.recno,
                  field: x.field,
                  reason: x.reason,
                  fix: x.fix,
                })),
                reconciliation: {
                  matches: output.reconciliation.matches,
                  lines: output.reconciliation.lines,
                },
              }
            : null,
        // The prove step's summary; the cases themselves are its proof_case events.
        proof:
          step === 'prove' && r?.status === 'done' && typeof output?.numRuns === 'number'
            ? {
                soulVersion: output.soulVersion ?? 0,
                seed: output.seed ?? 0,
                numRuns: output.numRuns,
                lanes: output.lanes ?? 1,
                passed: output.passed ?? 0,
                failed: output.failed ?? 0,
                skipped: output.skipped ?? 0,
                counterexample: output.counterexample ?? null,
                certificate: output.certificate ?? null,
              }
            : null,
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
