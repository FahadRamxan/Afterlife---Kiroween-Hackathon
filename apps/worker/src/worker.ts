export type WorkerOptions = {
  /** How often to log a heartbeat. The pg-boss job loop replaces this in Prompt 37. */
  heartbeatMs?: number;
  log?: (line: string) => void;
};

export type RunningWorker = { stop: () => Promise<void> };

export function startWorker({
  heartbeatMs = 60_000,
  log = console.log,
}: WorkerOptions = {}): RunningWorker {
  log('afterlife worker started');
  const timer = setInterval(
    () => log(`afterlife worker heartbeat ${new Date().toISOString()}`),
    heartbeatMs,
  );
  let stopped = false;
  return {
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      log('afterlife worker stopped');
    },
  };
}
