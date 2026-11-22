// The worker process: migrates the database (the API does too; an advisory lock keeps them from
// clashing), starts pg-boss, makes the queues, and runs the job loop until it is stopped.
import { certKeyFrom } from './cert-key';
import {
  createBoss,
  createDb,
  ensureQueues,
  migrateUp,
  type JobOptions,
  type JobType,
} from '@afterlife/db';
import { llmClientFrom, speechClientFrom, tokenBudgetFrom, type LlmClient } from '@afterlife/crew';
import { HeadlessPool } from '@afterlife/emulator/headless';
import { startJobLoop } from './loop';
import { defaultRegistry, type Registry } from './registry';
import { scannerFromEnv, type VirusScanner } from './scanner';

export type WorkerOptions = {
  databaseUrl: string | undefined;
  /** The handlers; by default defaultRegistry() on a headless js-dos pool. */
  registry?: Registry;
  /** Emulators at once (JSDOS_POOL_SIZE, default 1: two take 441 MiB, see docs/deploy.md). */
  poolSize?: number;
  /** The virus scanner for uploads (VIRUS_SCANNER: ClamAV by default). */
  scanner?: VirusScanner;
  /** The model (LLM_PROVIDER, BEDROCK_MODEL_ID, AWS_REGION); null for none. */
  llm?: LlmClient | null;
  /** Model tokens per project (LLM_TOKEN_BUDGET). */
  budgetTokens?: number;
  options?: Partial<Record<JobType, Partial<JobOptions>>>;
  pollingIntervalSeconds?: number;
  log?: (line: string) => void;
};

export type RunningWorker = { stop: () => Promise<void> };

export async function startWorker({
  databaseUrl,
  registry,
  poolSize = 1,
  scanner,
  llm,
  budgetTokens,
  options,
  pollingIntervalSeconds,
  log = console.log,
}: WorkerOptions): Promise<RunningWorker> {
  if (!databaseUrl)
    throw new Error('The worker needs DATABASE_URL: its jobs live in Postgres (pg-boss)');
  // Before anything starts: a malformed signing key stops the worker here.
  const certKey = registry ? null : await certKeyFrom(process.env);
  if (!registry && !certKey)
    log('No CERT_SIGNING_KEY: proofs run, but no Rebirth Certificate is issued');
  const db = createDb(databaseUrl, {
    max: 3,
    onIdleError: (e) => log(`database closed an idle connection: ${e.message}`),
  });
  const boss = createBoss(databaseUrl, { onError: (e) => log(`pg-boss error: ${e.message}`) });
  try {
    await migrateUp(db.$client);
    await boss.start();
    await ensureQueues(boss, options);
  } catch (e) {
    await boss.stop({ graceful: false }).catch(() => {});
    await db.$client.end();
    throw e;
  }
  // Chromium starts on the first boot, not here.
  const pool = new HeadlessPool({ size: poolSize, cycles: 60000 });
  const loop = await startJobLoop({
    db,
    boss,
    registry:
      registry ??
      defaultRegistry({
        pool,
        db,
        scanner: scanner ?? scannerFromEnv(process.env),
        llm: llm === undefined ? llmClientFrom(process.env) : llm,
        budgetTokens: budgetTokens ?? tokenBudgetFrom(process.env),
        certKey,
        ...(Number(process.env.PROVE_CASES) > 0
          ? { proveCases: Number(process.env.PROVE_CASES) }
          : {}),
        ...(Number(process.env.PROVE_LANES) > 0
          ? { proveLanes: Number(process.env.PROVE_LANES) }
          : {}),
        ...(Number(process.env.POSSESS_MAX_ACTIONS) > 0
          ? { maxActions: Number(process.env.POSSESS_MAX_ACTIONS) }
          : {}),
        ...(Number(process.env.POSSESS_PROBES) > 0
          ? { probesPerField: Number(process.env.POSSESS_PROBES) }
          : {}),
        speech: speechClientFrom(process.env),
      }),
    options,
    pollingIntervalSeconds,
    log,
  });
  log('afterlife worker started');
  let stopping: Promise<void> | undefined;
  return {
    stop() {
      stopping ??= (async () => {
        // Let the running attempt finish (up to 30 s), then close.
        await loop.stop();
        await boss.stop({ graceful: true, timeout: 30_000 });
        await pool.close();
        await db.$client.end();
        log('afterlife worker stopped');
      })();
      return stopping;
    },
  };
}
