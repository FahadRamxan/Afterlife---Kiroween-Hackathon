// Ghost Twin capture (Prompt 76): watches the shop's data folder (the DOS app's C:\ in DOSBox, or
// the emulator's drive in the demo) and turns each change to its DBF files into a twin event: the
// diff, in the data files' own format, and when it happened. Polling, not file-system events: a
// DOS program writes a DBF in several steps, and on some Windows folders watch events do not come.
// A file caught half written cannot be read; it is read again on the next look.
import { diffSnapshots, isEmptyDiff, type Snapshot, type SnapshotDiff } from '@afterlife/dbf';
import { snapshotDir } from '@afterlife/dbf/node';

export type TwinEvent = {
  /** 1, 2, 3, ... from the start of this capture. */
  seq: number;
  occurredAt: string;
  /** The DBF files that changed. */
  files: string[];
  diff: SnapshotDiff;
};

export type CaptureOptions = {
  dir: string;
  /**
   * Sends one event, and may give the number the API keeps it under; throws when it could not (it
   * is sent again, before newer ones). An error with `fatal: true` stops the capture instead.
   */
  post: (e: TwinEvent) => Promise<number | void>;
  intervalMs?: number;
  now?: () => Date;
  /** Told what happened, for the CLI's output. */
  log?: (message: string) => void;
  /** Told once when the capture stops for good (the shop switched over). */
  onFatal?: (e: Error) => void;
  /** For tests: runs before each look (a slow disk). */
  beforeLook?: () => Promise<void> | void;
};

export type Capture = {
  /** Looks at the folder once; gives the event it made, or null. */
  tick(): Promise<TwinEvent | null>;
  /** Events made but not taken by the API yet. */
  pending(): number;
  /** Starts looking at the interval; resolves once the first look (the starting point) is taken. */
  start(): Promise<void>;
  stop(): Promise<void>;
};

const changed = (d: SnapshotDiff) =>
  [
    ...new Set([
      ...Object.keys(d.tables).filter((f) => !d.unchanged.includes(f)),
      ...d.addedTables,
      ...d.removedTables,
    ]),
  ].sort();

export function createCapture(opts: CaptureOptions): Capture {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  let last: Snapshot | null = null;
  let seq = 0;
  const queue: TwinEvent[] = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let running: Promise<unknown> = Promise.resolve();
  let stopped = false;

  async function flush() {
    while (queue.length && !stopped) {
      try {
        const taken = await opts.post(queue[0]!);
        log(`sent change ${typeof taken === 'number' ? taken : queue[0]!.seq}`);
        queue.shift();
      } catch (e) {
        if ((e as { fatal?: boolean }).fatal) {
          // Nothing more will be taken: stop looking instead of sending it again every interval.
          stopped = true;
          if (timer) clearInterval(timer);
          timer = null;
          log(`stopped: ${(e as Error).message}`);
          opts.onFatal?.(e as Error);
          return;
        }
        log(`could not send change ${queue[0]!.seq} yet: ${(e as Error).message}`);
        return;
      }
    }
  }

  async function tick(): Promise<TwinEvent | null> {
    if (stopped) return null;
    let next: Snapshot;
    await opts.beforeLook?.();
    try {
      next = await snapshotDir(opts.dir);
    } catch (e) {
      // Half written, or the folder is busy: the next look reads it.
      log(`skipped a look: ${(e as Error).message}`);
      await flush();
      return null;
    }
    const before = last;
    last = next;
    let event: TwinEvent | null = null;
    if (before) {
      const diff = diffSnapshots(before, next);
      if (!isEmptyDiff(diff)) {
        event = { seq: ++seq, occurredAt: now().toISOString(), files: changed(diff), diff };
        queue.push(event);
        log(`change ${event.seq}: ${event.files.join(', ')}`);
      }
    }
    await flush();
    return event;
  }

  return {
    tick,
    pending: () => queue.length,
    async start() {
      if (timer || stopped) return;
      const look = () => {
        running = running.then(tick, tick);
      };
      look();
      timer = setInterval(look, opts.intervalMs ?? 1000);
      await running;
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await running;
    },
  };
}
