// Séance sessions (Prompt 31). Stored behind SessionStore: in Postgres (sessions-pg.ts) when
// DATABASE_URL is set, otherwise in memory.
import { SeanceSessionSchema, type SeanceSession } from '@afterlife/emulator';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidv7 } from '@afterlife/db';

export interface SessionStore {
  /** Where the séances live, shown on /health and in the web app's footer. */
  readonly kind: 'memory' | 'postgres';
  /** `sizeBytes`: the séance as sent (default: its JSON), counted against the storage cap. */
  create(session: SeanceSession, sizeBytes?: number): Promise<string>;
  get(id: string): Promise<SeanceSession | null>;
  /** Bytes of all séances kept, for the storage cap. */
  usedBytes(): Promise<number>;
}

/** The size of a séance as the API counts it. */
export const seanceBytes = (s: SeanceSession) => Buffer.byteLength(JSON.stringify(s));

/** Keeps the newest `limit` sessions in memory (a demo server must not grow without bound). */
export class MemorySessionStore implements SessionStore {
  readonly kind = 'memory';
  private readonly sessions = new Map<string, { s: SeanceSession; bytes: number }>();
  constructor(private readonly limit = 200) {}

  async create(session: SeanceSession, sizeBytes = seanceBytes(session)): Promise<string> {
    const id = uuidv7();
    this.sessions.set(id, { s: session, bytes: sizeBytes });
    while (this.sessions.size > this.limit)
      this.sessions.delete(this.sessions.keys().next().value!);
    return id;
  }

  async usedBytes(): Promise<number> {
    let n = 0;
    for (const v of this.sessions.values()) n += v.bytes;
    return n;
  }

  async get(id: string): Promise<SeanceSession | null> {
    return this.sessions.get(id)?.s ?? null;
  }
}

/** A séance with a voice note fits in 8 MB (the audio itself is capped at about 3.7 MB). */
export const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const Id = z.uuid();

export function sessionRoutes(
  store: SessionStore,
  opts: {
    createPerMinute: number;
    /** The most bytes of séances kept in all (SEANCE_STORAGE_MB). */
    storageLimitBytes: number;
    /** True when a raised project with this id exists. */
    projectExists: (id: string) => Promise<boolean>;
  },
) {
  return async (app: FastifyInstance) => {
    // Each séance can be 8 MB, so it gets the same lower per-address limit as a raise: the
    // global 300 a minute would let one visitor write gigabytes a minute.
    const config = { rateLimit: { max: opts.createPerMinute, timeWindow: '1 minute' } };
    app.post('/api/sessions', { bodyLimit: MAX_SESSION_BYTES, config }, async (req, reply) => {
      const parsed = SeanceSessionSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: 'BAD_SESSION',
          // Where and what, without echoing the values sent.
          message: parsed.error.issues
            .slice(0, 5)
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        });
      const s = parsed.data;
      if (s.raisedProjectId && !(await opts.projectExists(s.raisedProjectId)))
        return reply.code(404).send({ error: 'NO_PROJECT', message: 'No such project' });
      const size = seanceBytes(s);
      if ((await store.usedBytes()) + size > opts.storageLimitBytes)
        return reply.code(507).send({
          error: 'STORAGE_FULL',
          message: `The séance storage is full (${Math.round(opts.storageLimitBytes / 1024 / 1024)} MB). Ask the owner of this site to make room.`,
        });
      const id = await store.create(s, size);
      return reply.code(201).send({ id, actions: parsed.data.actions.length });
    });

    app.get<{ Params: { id: string } }>('/api/sessions/:id', async (req, reply) => {
      if (!Id.safeParse(req.params.id).success)
        return reply.code(400).send({ error: 'BAD_ID', message: 'Not a session id' });
      const s = await store.get(req.params.id);
      if (!s) return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such session' });
      return { id: req.params.id, ...s };
    });
  };
}
