// A small pool with a hard limit (Prompt 28): at most `size` emulators run at once, the rest
// wait in turn. Items are never reused: each one is destroyed on release, so every run starts
// from a fresh boot.
import { MAX_CYCLES, MIN_CYCLES } from '@afterlife/emulator';
import { z } from 'zod';

export class PoolClosedError extends Error {
  override name = 'PoolClosedError';
}

export type PoolOptions<T> = {
  size: number;
  create: () => Promise<T>;
  destroy: (item: T) => Promise<void>;
};

export class Pool<T> {
  private active = 0;
  private closed = false;
  private readonly out = new Set<T>();
  private readonly queue: { resolve: () => void; reject: (e: Error) => void }[] = [];

  constructor(private readonly opts: PoolOptions<T>) {
    if (!Number.isInteger(opts.size) || opts.size < 1)
      throw new RangeError('Pool size must be 1 or more');
  }

  /** How many callers are waiting for a slot. */
  get waiting(): number {
    return this.queue.length;
  }

  async acquire(): Promise<T> {
    if (this.closed) throw new PoolClosedError('The pool is closed');
    if (this.active >= this.opts.size)
      await new Promise<void>((resolve, reject) => this.queue.push({ resolve, reject }));
    else this.active++;
    // The slot is ours now (a releaser handed it over, or there was room).
    try {
      const item = await this.opts.create();
      this.out.add(item);
      return item;
    } catch (e) {
      this.free();
      throw e;
    }
  }

  async release(item: T): Promise<void> {
    if (!this.out.delete(item)) return;
    try {
      await this.opts.destroy(item);
    } finally {
      this.free();
    }
  }

  /** Runs work with an item and always releases it. */
  async use<R>(work: (item: T) => Promise<R>): Promise<R> {
    const item = await this.acquire();
    try {
      return await work(item);
    } finally {
      await this.release(item);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const w of this.queue.splice(0)) w.reject(new PoolClosedError('The pool was closed'));
    await Promise.all([...this.out].map((item) => this.release(item)));
  }

  private free() {
    const next = this.queue.shift();
    // Hand the slot straight to the next waiter, so nobody can jump the queue.
    if (next) next.resolve();
    else this.active--;
  }
}

const EnvSchema = z.object({
  /** Most emulators (headless Chromium pages) running at once. */
  JSDOS_POOL_SIZE: z.coerce.number().int().min(1).max(16).default(2),
  /** DOSBox speed for headless runs. Higher is faster; tests use more than the default. */
  JSDOS_CYCLES: z.coerce.number().int().min(MIN_CYCLES).max(MAX_CYCLES).default(20000),
});

export function parsePoolEnv(env: Record<string, string | undefined>): {
  size: number;
  cycles: number;
} {
  const r = EnvSchema.safeParse(env);
  if (!r.success)
    throw new Error(
      `Invalid emulator pool settings: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  return { size: r.data.JSDOS_POOL_SIZE, cycles: r.data.JSDOS_CYCLES };
}
