import { startWorker } from './worker';

let worker: Awaited<ReturnType<typeof startWorker>>;
try {
  worker = await startWorker({
    databaseUrl: process.env.DATABASE_URL || undefined,
    poolSize: Number(process.env.JSDOS_POOL_SIZE) || 1,
  });
} catch (e) {
  console.error(`afterlife worker could not start: ${(e as Error).message}`);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    worker.stop().then(() => process.exit(0));
  });
}
