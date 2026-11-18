// LISTEN for new project events (Prompt 38). The trigger from migration 0002 announces each
// insert on "project_events" as {"p": projectId, "s": seq}. One dedicated connection per process;
// if it drops, a new one is opened and `onReconnect` lets the caller catch up on what it missed.
import pg from 'pg';

export const EVENTS_CHANNEL = 'project_events';

export type EventListener = { close(): Promise<void> };

export async function listenForEvents(
  url: string,
  onEvent: (projectId: string, seq: number) => void,
  opts: { retryMs?: number; onReconnect?: () => void; onError?: (e: Error) => void } = {},
): Promise<EventListener> {
  let closed = false;
  let client: pg.Client | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function connect(): Promise<pg.Client> {
    const c = new pg.Client({ connectionString: url, application_name: 'afterlife-live' });
    c.on('notification', (m) => {
      if (m.channel !== EVENTS_CHANNEL || !m.payload) return;
      try {
        const { p, s } = JSON.parse(m.payload) as { p: string; s: number };
        onEvent(p, Number(s));
      } catch (e) {
        opts.onError?.(e as Error);
      }
    });
    c.on('error', (e) => {
      opts.onError?.(e);
      lost(c);
    });
    c.on('end', () => lost(c));
    try {
      await c.connect();
      await c.query(`LISTEN ${EVENTS_CHANNEL}`);
    } catch (e) {
      c.removeAllListeners('end');
      await c.end().catch(() => {});
      throw e;
    }
    return c;
  }

  /** The current connection went away: drop it and connect again. */
  function lost(c: pg.Client) {
    if (client !== c) return;
    client = undefined;
    c.end().catch(() => {});
    reconnect();
  }

  /** Tries again every retryMs until the database is back. */
  function reconnect() {
    if (closed || timer) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (closed) return;
      try {
        client = await connect();
        if (closed) await client.end().catch(() => {});
        else opts.onReconnect?.();
      } catch (e) {
        opts.onError?.(e as Error);
        reconnect();
      }
    }, opts.retryMs ?? 1000);
  }

  client = await connect();
  return {
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      await client?.end().catch(() => {});
    },
  };
}
