// Live progress (Prompt 38): GET /api/projects/:id/live is a WebSocket that replays a project's
// last 200 events, then streams each new one. The worker writes events; the database announces
// them (LISTEN/NOTIFY); one listener per API process wakes the sockets of that project, and each
// socket reads what it has not sent yet, in seq order.
import {
  lastEvents,
  listEvents,
  listenForEvents,
  projects,
  eq,
  type Db,
  type EventListener,
  type ProjectEvent,
} from '@afterlife/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export const REPLAY = 200;

export interface LiveHub {
  exists(projectId: string): Promise<boolean>;
  /** The newest REPLAY events, or the ones after `afterSeq`. */
  replay(projectId: string, afterSeq?: number): Promise<ProjectEvent[]>;
  after(projectId: string, seq: number): Promise<ProjectEvent[]>;
  /** Calls `wake` whenever the project has a new event. Returns the unsubscribe. */
  subscribe(projectId: string, wake: () => void): () => void;
  close(): Promise<void>;
}

export class PgLiveHub implements LiveHub {
  private readonly subs = new Map<string, Set<() => void>>();
  private listener: EventListener | undefined;

  private constructor(private readonly db: Db) {}

  static async start(
    db: Db,
    url: string,
    log: { warn(msg: string): void } = { warn: () => {} },
  ): Promise<PgLiveHub> {
    const hub = new PgLiveHub(db);
    hub.listener = await listenForEvents(url, (p) => hub.wake(p), {
      onError: (e) => log.warn(`live events listener: ${e.message}`),
      // Notices sent while the listener was away are lost: wake everyone to catch up.
      onReconnect: () => {
        for (const p of hub.subs.keys()) hub.wake(p);
      },
    });
    return hub;
  }

  private wake(projectId: string) {
    for (const w of this.subs.get(projectId) ?? []) w();
  }

  async exists(projectId: string) {
    return (
      (await this.db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)))
        .length > 0
    );
  }

  replay(projectId: string, afterSeq?: number) {
    return afterSeq === undefined
      ? lastEvents(this.db, projectId, REPLAY)
      : listEvents(this.db, projectId, { afterSeq, limit: REPLAY });
  }

  after(projectId: string, seq: number) {
    return listEvents(this.db, projectId, { afterSeq: seq, limit: 500 });
  }

  subscribe(projectId: string, wake: () => void) {
    let set = this.subs.get(projectId);
    if (!set) this.subs.set(projectId, (set = new Set()));
    set.add(wake);
    return () => {
      set.delete(wake);
      if (!set.size) this.subs.delete(projectId);
    };
  }

  async close() {
    await this.listener?.close();
  }
}

const Params = z.object({ id: z.string() });
const Query = z.object({ after: z.coerce.number().int().nonnegative().optional() });
const UUID = z.uuid();

/** Close codes: 4400 bad id, 4403 another site's page, 4404 no such project, 4503 no database. */
export function liveRoutes(hub: LiveHub | null, allowedOrigins: string[]) {
  return async (app: FastifyInstance) => {
    app.get(
      '/api/projects/:id/live',
      { websocket: true, schema: { hide: true } },
      (socket, req) => {
        const params = Params.parse(req.params);
        const query = Query.safeParse(req.query);
        const origin = req.headers.origin;
        // Browsers send Origin on a WebSocket, and CORS does not apply: check it here.
        if (origin && !allowedOrigins.includes(origin))
          return socket.close(4403, 'Not an allowed origin');
        if (!hub) return socket.close(4503, 'No database: there are no live events');
        if (!UUID.safeParse(params.id).success || !query.success)
          return socket.close(4400, 'Not a project id');
        const id = params.id;

        let last = 0;
        let busy: Promise<void> = Promise.resolve();
        let open = true;
        const send = (events: ProjectEvent[]) => {
          for (const e of events) {
            if (!open || e.seq <= last) continue;
            socket.send(JSON.stringify(e));
            last = e.seq;
          }
        };
        // One read at a time, so events go out in order and never twice.
        const pump = () => {
          busy = busy
            .then(async () => {
              if (open) send(await hub.after(id, last));
            })
            .catch((e) => req.log.warn({ err: e }, 'live: read failed'));
        };
        // Subscribe before the replay, so nothing written in between is missed.
        const unsubscribe = hub.subscribe(id, pump);
        socket.on('close', () => {
          open = false;
          unsubscribe();
        });
        busy = (async () => {
          if (!(await hub.exists(id))) {
            open = false;
            unsubscribe();
            return socket.close(4404, 'No such project');
          }
          if (query.data.after !== undefined) last = query.data.after;
          send(await hub.replay(id, query.data.after));
        })().catch((e) => {
          req.log.warn({ err: e }, 'live: replay failed');
          socket.close(1011, 'Could not read the events');
        });
        pump();
      },
    );
  };
}
