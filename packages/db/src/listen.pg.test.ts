// Live events over LISTEN/NOTIFY (Prompt 38): an insert into project_events is announced, and the
// listener comes back by itself when its connection is killed.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { emitEvent } from './events';
import { listenForEvents, type EventListener } from './listen';
import { projects } from './schema';
import { freshDatabase, type TestDatabase } from './testing';

vi.setConfig({ testTimeout: 30_000 });

let t: TestDatabase;
let projectId: string;
beforeAll(async () => {
  t = await freshDatabase();
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  projectId = p!.id;
});
afterAll(() => t.drop());

async function until(ok: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('listenForEvents', () => {
  let l: EventListener | undefined;
  afterAll(() => l?.close());

  it('hears each new event with its project and seq, from another connection', async () => {
    const heard: [string, number][] = [];
    l = await listenForEvents(t.url, (p, s) => heard.push([p, s]));
    const a = await emitEvent(t.db, projectId, 'log', { level: 'info', message: 'one' });
    const b = await emitEvent(t.db, projectId, 'log', { level: 'info', message: 'two' });
    await until(() => heard.length === 2);
    expect(heard).toEqual([
      [projectId, a.seq],
      [projectId, b.seq],
    ]);
    await l.close();
    l = undefined;
  });

  it('a screen-sized event (8 kB) is announced too: the notice carries only its seq', async () => {
    const heard: number[] = [];
    l = await listenForEvents(t.url, (_, s) => heard.push(s));
    const e = await emitEvent(t.db, projectId, 'screen', { big: 'x'.repeat(9000) });
    await until(() => heard.includes(e.seq));
    await l.close();
    l = undefined;
  });

  it('when its connection is killed it reconnects, says so, and hears later events', async () => {
    const heard: number[] = [];
    let reconnects = 0;
    l = await listenForEvents(t.url, (_, s) => heard.push(s), {
      retryMs: 100,
      onReconnect: () => reconnects++,
      onError: () => {},
    });
    await t.db.$client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = current_database() AND application_name = 'afterlife-live'`,
    );
    await until(() => reconnects === 1);
    const e = await emitEvent(t.db, projectId, 'log', { level: 'info', message: 'after' });
    await until(() => heard.includes(e.seq));
  });
});
