// The reborn app on the phone (Prompt 60): the shop's records, the Soul and the outbox are in
// IndexedDB, so a bill can be made with no network. Online, the Soul and the first records come
// from the server, sales are synced, and the server's records (other phones' sales) come back.
import type { DbfRecord } from '@afterlife/dbf';
import { SoulSchema, type Soul } from '@afterlife/soul';
import {
  createVessel,
  queuedVessel,
  seedStore,
  syncOutbox,
  type EntityStore,
  type Outbox,
  type StockConflict,
  type SyncItem,
  type SyncResult,
  type Vessel,
} from '@afterlife/vessel';
import { findApp } from './graveyard';
import { getProject } from './projects';
import { getSoul } from './soul-client';

/** What a phone keeps (openPhone in @afterlife/vessel/indexeddb; memory in tests). */
export type Phone = {
  store: EntityStore;
  outbox: Outbox;
  meta: {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
  };
};

type Kept = { soul: Soul; version: number; today: string };

export type PhoneVessel = { vessel: Vessel; soul: Soul; version: number; today: string };

export class PhoneError extends Error {
  constructor(
    readonly reason: 'no-soul' | 'no-actions' | 'no-data' | 'never-online',
    message: string = reason,
  ) {
    super(message);
  }
}

const base = (api: string) => api.replace(/\/+$/, '');

/**
 * The Vessel on this phone. Online: the newest Soul, and the first records from the old app's
 * bundle (or, for an uploaded app, the server's, migrated by the Undertaker); offline: what the
 * phone kept from last time. Every saved bill goes into the outbox.
 */
export async function startPhone(
  phone: Phone,
  opts: {
    api: string | undefined;
    projectId: string;
    fetcher?: typeof fetch;
    newId?: () => string;
  },
): Promise<PhoneVessel> {
  const fetcher = opts.fetcher ?? fetch;
  let kept = await phone.meta.get<Kept>('soul');
  const [p, s] = await Promise.all([
    getProject(opts.api, opts.projectId, fetcher),
    getSoul(opts.api, opts.projectId, fetcher),
  ]);
  if (s.ok) {
    if (!s.soul.actions.length) throw new PhoneError('no-actions');
    const app = p.ok && p.project.source === 'graveyard' ? findApp(p.project.sourceApp) : undefined;
    const today = ((p.ok ? p.project.dosTime : null) ?? app?.dosTime ?? kept?.today ?? '').slice(
      0,
      10,
    );
    if (!(await phone.meta.get<boolean>('seeded'))) {
      if (app) {
        const res = await fetcher(app.bundle);
        if (!res.ok) throw new PhoneError('no-data', `${res.status}`);
        await seedStore(phone.store, new Uint8Array(await res.arrayBuffer()), s.soul);
      } else {
        // An uploaded app has no bundle here: its first records are the ones the Undertaker
        // migrated into the server (Prompt 64), or there are none yet.
        const files = await serverRecords(opts.api, opts.projectId, fetcher);
        if (!files) throw new PhoneError('no-data');
        for (const [file, records] of Object.entries(files)) await phone.store.load(file, records);
      }
      await phone.meta.set('seeded', true);
    }
    kept = { soul: s.soul, version: s.version, today };
    await phone.meta.set('soul', kept);
  } else if (s.reason === 'none') throw new PhoneError('no-soul');
  if (!kept) throw new PhoneError('never-online');
  const soul = SoulSchema.parse(kept.soul);
  const today = () => kept!.today;
  const vessel = queuedVessel(createVessel(soul, phone.store, { today }), phone.outbox, {
    today,
    newId: opts.newId ?? (() => crypto.randomUUID()),
  });
  return { vessel, soul, version: kept.version, today: kept.today };
}

export type Synced = {
  results: SyncResult[];
  /** Sales still waiting (the network went, or the server is not there). */
  left: number;
  /** Stock changes the server wants the owner to look at. */
  review: { id: string; at: string; record: string | null; conflicts: StockConflict[] }[];
  /** The server's records were taken: other phones' sales are on this one now. */
  pulled: boolean;
};

/**
 * Runs the jobs given to it one after another, never two at once: a sync asked for while one is on
 * its way (a bill saved, the network back) starts when that one ends, so the same outbox is not
 * sent twice at the same time.
 */
export function oneAtATime() {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = last.then(job, job);
    last = run.catch(() => undefined);
    return run;
  };
}

/** The server's records of the project, by data file, or null when it has none yet. */
async function serverRecords(
  api: string | undefined,
  projectId: string,
  fetcher: typeof fetch,
): Promise<Record<string, DbfRecord[]> | null> {
  if (!api) return null;
  const r = await fetcher(
    `${base(api)}/api/projects/${encodeURIComponent(projectId)}/vessel/records`,
    { cache: 'no-store' },
  );
  if (!r.ok) return null;
  return ((await r.json()) as { files: Record<string, DbfRecord[]> }).files;
}

/** Sends the outbox; then, with nothing left to send, takes the server's records. */
export async function syncPhone(
  phone: Phone,
  opts: { api: string; projectId: string; files: string[]; fetcher?: typeof fetch },
): Promise<Synced> {
  const fetcher = opts.fetcher ?? fetch;
  const url = (p: string) =>
    `${base(opts.api)}/api/projects/${encodeURIComponent(opts.projectId)}/vessel${p}`;
  const { results, left } = await syncOutbox(phone.outbox, async (items: SyncItem[]) => {
    const res = await fetcher(url('/sync'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(`The server answered ${res.status}`);
    return ((await res.json()) as { results: SyncResult[] }).results;
  });
  let pulled = false;
  let review: Synced['review'] = [];
  if (!left) {
    try {
      const r = await fetcher(url('/records'), { cache: 'no-store' });
      if (r.ok) {
        const files = ((await r.json()) as { files: Record<string, DbfRecord[]> }).files;
        // Only when nothing was saved here meanwhile: that sale goes first, next time.
        if (!(await phone.outbox.pending()).length) {
          for (const f of opts.files) if (files[f]) await phone.store.load(f, files[f]);
          pulled = true;
        }
      }
      const c = await fetcher(url('/conflicts'), { cache: 'no-store' });
      if (c.ok) review = ((await c.json()) as { conflicts: Synced['review'] }).conflicts;
    } catch {
      // The network went again: the records stay as they are on the phone.
    }
  }
  return { results, left, review, pulled };
}

/** Marks a stock conflict as looked at. */
export async function reviewed(
  api: string,
  projectId: string,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetcher(
      `${base(api)}/api/projects/${encodeURIComponent(projectId)}/vessel/conflicts/${encodeURIComponent(id)}/review`,
      { method: 'POST' },
    );
    return res.ok;
  } catch {
    return false;
  }
}
