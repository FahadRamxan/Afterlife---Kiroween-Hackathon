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
  /** Sends one event; throws when it could not (it is sent again, before newer ones). */
  post: (e: TwinEvent) => Promise<void>;
  intervalMs?: number;
  now?: () => Date;
  /** Told what happened, for the CLI's output. */
  log?: (message: string) => void;
};

export type Capture = {
  /** Looks at the folder once; gives the event it made, or null. */
  tick(): Promise<TwinEvent | null>;
  /** Events made but not taken by the API yet. */
  pending(): number;
  start(): void;
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

  async function flush() {
    while (queue.length) {
      try {
        await opts.post(queue[0]!);
        log(`sent change ${queue[0]!.seq}`);
        queue.shift();
      } catch (e) {
        log(`could not send change ${queue[0]!.seq} yet: ${(e as Error).message}`);
        return;
      }
    }
  }

  async function tick(): Promise<TwinEvent | null> {
    let next: Snapshot;
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
    start() {
      if (timer) return;
      const look = () => {
        running = running.then(tick, tick);
      };
      look();
      timer = setInterval(look, opts.intervalMs ?? 1000);
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await running;
    },
  };
}
