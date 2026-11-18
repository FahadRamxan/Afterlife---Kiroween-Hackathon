// Séance sessions (Prompt 31). Stored behind SessionStore: in memory until the database
// (Prompt 35) brings a Postgres store.
import { SeanceSessionSchema, type SeanceSession } from '@afterlife/emulator';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidv7 } from './uuid';

export interface SessionStore {
  create(session: SeanceSession): Promise<string>;
  get(id: string): Promise<SeanceSession | null>;
}

/** Keeps the newest `limit` sessions in memory (a demo server must not grow without bound). */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SeanceSession>();
  constructor(private readonly limit = 200) {}

  async create(session: SeanceSession): Promise<string> {
    const id = uuidv7();
    this.sessions.set(id, session);
    while (this.sessions.size > this.limit)
      this.sessions.delete(this.sessions.keys().next().value!);
    return id;
  }

  async get(id: string): Promise<SeanceSession | null> {
    return this.sessions.get(id) ?? null;
  }
}

/** A séance with a voice note fits in 8 MB (the audio itself is capped at about 3.7 MB). */
export const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const Id = z.uuid();

export function sessionRoutes(store: SessionStore) {
  return async (app: FastifyInstance) => {
    app.post('/api/sessions', { bodyLimit: MAX_SESSION_BYTES }, async (req, reply) => {
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
      const id = await store.create(parsed.data);
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
