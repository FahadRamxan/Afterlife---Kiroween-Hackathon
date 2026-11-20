// A project's kept screen graph (Prompt 52): the screens possession found and the keys between
// them. The Oracle and Ghost Twin replay paths from it; the Possession tab can draw it.
import { loadGraph, type ScreenGraphJson } from '@afterlife/crew';
import type { Db } from '@afterlife/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export interface ScreenGraphStore {
  get(projectId: string): Promise<ScreenGraphJson | null>;
}

export class PgScreenGraphStore implements ScreenGraphStore {
  constructor(private readonly db: Db) {}
  get(projectId: string) {
    return loadGraph(this.db, projectId);
  }
}

const Id = z.uuid();

export function screenGraphRoutes(
  store: ScreenGraphStore | undefined,
  opts: { projectExists: (id: string) => Promise<boolean> },
) {
  return async (app: FastifyInstance) => {
    app.get<{ Params: { id: string } }>('/api/projects/:id/screen-graph', async (req, reply) => {
      if (!Id.safeParse(req.params.id).success)
        return reply.code(400).send({ error: 'BAD_ID', message: 'Not an id' });
      if (!store)
        return reply.code(503).send({
          error: 'NO_DATABASE',
          message: 'This API has no database, so it keeps no graphs',
        });
      if (!(await opts.projectExists(req.params.id)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' });
      const g = await store.get(req.params.id);
      if (!g)
        return reply
          .code(404)
          .send({ error: 'NO_GRAPH', message: 'This project has not been possessed yet' });
      return { projectId: req.params.id, ...g };
    });
  };
}
