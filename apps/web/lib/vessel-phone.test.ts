import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import {
  MemoryEntityStore,
  MemoryOutbox,
  replaySale,
  seedStore,
  type SyncItem,
} from '@afterlife/vessel';
import { describe, expect, it } from 'vitest';
import { PhoneError, oneAtATime, startPhone, syncPhone, type Phone } from './vessel-phone';

const bundle = new Uint8Array(readFileSync(resolve(__dirname, '../public/graveyard/shifa.jsdos')));
const API = 'http://api';
const ID = '0190a0b0-0000-7000-8000-000000000001';
const FILES = SHIFA_REFERENCE_SOUL.entities.map((e) => e.file);

function memoryPhone(): Phone {
  const meta = new Map<string, unknown>();
  return {
    store: new MemoryEntityStore(),
    outbox: new MemoryOutbox(),
    meta: {
      get: async <T>(k: string) => structuredClone(meta.get(k)) as T | undefined,
      set: async (k, v) => void meta.set(k, structuredClone(v)),
    },
  };
}

/** The API, as the phone sees it: a project, its Soul, the bundle, and a server that replays sales. */
async function fakeApi() {
  const server = new MemoryEntityStore();
  await seedStore(server, bundle, SHIFA_REFERENCE_SOUL);
  const state = { online: true, synced: [] as string[] };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    if (!state.online) throw new TypeError('Failed to fetch');
    const url = String(input);
    if (url === '/graveyard/shifa.jsdos') return new Response(bundle);
    if (url.endsWith(`/api/projects/${ID}`))
      return json({
        id: ID,
        name: 'Shifa',
        source: 'graveyard',
        sourceApp: 'shifa',
        dosTime: null,
        status: 'created',
        mode: 'live',
        createdAt: '2026-11-20T00:00:00.000Z',
      });
    if (url.endsWith('/timeline')) return json({ events: [] });
    if (url.endsWith('/soul')) return json({ version: 1, soul: SHIFA_REFERENCE_SOUL });
    if (url.endsWith('/vessel/sync')) {
      const { items } = JSON.parse(String(init!.body)) as { items: SyncItem[] };
      const results = [];
      for (const i of items) {
        results.push(await replaySale(SHIFA_REFERENCE_SOUL, server, i));
        state.synced.push(i.id);
      }
      return json({ results });
    }
    if (url.endsWith('/vessel/records'))
      return json({
        files: Object.fromEntries(
          await Promise.all(FILES.map(async (f) => [f, await server.records(f)])),
        ),
      });
    if (url.endsWith('/vessel/conflicts')) return json({ conflicts: [] });
    return json({ error: 'NOT_FOUND' }, 404);
  }) as typeof fetch;
  return { server, state, fetcher };
}

describe('the Vessel on the phone', () => {
  it('opened online once, it works offline: bills go into the outbox, then reach the server', async () => {
    const api = await fakeApi();
    const phone = memoryPhone();
    let n = 0;
    const newId = () => `0190a0b0-0000-7000-8000-${String(++n).padStart(12, '0')}`;
    const opts = { api: API, projectId: ID, fetcher: api.fetcher, newId };
    await startPhone(phone, opts);

    api.state.online = false;
    // Opened again with no network: from what the phone kept.
    const { vessel, today } = await startPhone(phone, opts);
    expect(today).toBe('1998-07-15');
    for (const q of ['1', '2', '3'])
      expect(
        (await vessel.performAction('save-bill', { lines: [{ CODE: 'INS100', QTY: q }] })).ok,
      ).toBe(true);
    expect(await phone.outbox.pending()).toHaveLength(3);
    const offline = await syncPhone(phone, {
      api: API,
      projectId: ID,
      files: FILES,
      fetcher: api.fetcher,
    });
    expect(offline).toMatchObject({ left: 3, pulled: false });

    api.state.online = true;
    const back = await syncPhone(phone, {
      api: API,
      projectId: ID,
      files: FILES,
      fetcher: api.fetcher,
    });
    expect(back).toMatchObject({ left: 0, pulled: true, review: [] });
    expect(back.results.map((r) => r.ok)).toEqual([true, true, true]);
    for (const f of FILES)
      expect(await api.server.records(f)).toEqual(await phone.store.records(f));
  });

  it('never opened online: it says so, and a Soul with nothing to do says that', async () => {
    const api = await fakeApi();
    api.state.online = false;
    await expect(
      startPhone(memoryPhone(), { api: API, projectId: ID, fetcher: api.fetcher }),
    ).rejects.toMatchObject({
      reason: 'never-online',
    });
    const none = (async () =>
      new Response('{"error":"NO_SOUL"}', { status: 404 })) as unknown as typeof fetch;
    await expect(
      startPhone(memoryPhone(), { api: API, projectId: ID, fetcher: none }),
    ).rejects.toBeInstanceOf(PhoneError);
  });

  it('another phone’s sales come back from the server', async () => {
    const api = await fakeApi();
    const a = memoryPhone();
    const b = memoryPhone();
    const opts = { api: API, projectId: ID, fetcher: api.fetcher };
    const va = (await startPhone(a, opts)).vessel;
    await startPhone(b, opts);
    await va.performAction('save-bill', { lines: [{ CODE: 'PAN500', QTY: '5' }] });
    await syncPhone(a, { ...opts, files: FILES });
    await syncPhone(b, { ...opts, files: FILES });
    const pan = (await b.store.records('MEDICINE.DBF')).find((r) => r.values.CODE === 'PAN500')!;
    expect(pan.values.QTY).toBe('235');
  });
});

describe('oneAtATime', () => {
  it('a sync asked for while one is on its way starts when that one ends, even if it failed', async () => {
    const queue = oneAtATime();
    const log: string[] = [];
    let open: () => void = () => undefined;
    const first = queue(
      () =>
        new Promise<string>((resolve, reject) => {
          log.push('first starts');
          open = () => {
            log.push('first ends');
            reject(new Error('the network went'));
          };
          void resolve;
        }),
    );
    const second = queue(async () => {
      log.push('second starts');
      return 'sent';
    });
    await Promise.resolve();
    expect(log).toEqual(['first starts']);
    open();
    await expect(first).rejects.toThrow('the network went');
    expect(await second).toBe('sent');
    expect(log).toEqual(['first starts', 'first ends', 'second starts']);
  });
});
