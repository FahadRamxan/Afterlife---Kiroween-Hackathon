import { startWorker } from './worker';

const worker = startWorker();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    worker.stop().then(() => process.exit(0));
  });
}
