import { describe, expect, it, vi } from 'vitest';
import { startWorker } from './worker';

describe('startWorker', () => {
  it('logs a heartbeat on each interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const lines: string[] = [];
    const worker = startWorker({ heartbeatMs: 1000, log: (l) => lines.push(l) });
    expect(lines[0]).toMatch(/worker started/);

    vi.advanceTimersByTime(3000);
    expect(lines.filter((l) => l.includes('heartbeat'))).toHaveLength(3);

    await worker.stop();
    vi.advanceTimersByTime(5000);
    expect(lines.filter((l) => l.includes('heartbeat'))).toHaveLength(3);
    expect(lines.at(-1)).toMatch(/worker stopped/);
    vi.useRealTimers();
  });

  it('stop is idempotent', async () => {
    const lines: string[] = [];
    const worker = startWorker({ heartbeatMs: 1000, log: (l) => lines.push(l) });
    await worker.stop();
    await worker.stop();
    expect(lines.filter((l) => l.includes('stopped'))).toHaveLength(1);
  });
});
