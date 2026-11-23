// Ghost Twin on the API (Prompt 76): the shop's capture tool (afterlife-twin) sends each change to
// the old app's data files here. Only with the project's twin token: the API has no login, so the
// token is what keeps anyone else from writing into a shop's twin. Only its SHA-256 is kept.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, asc, emitEvent, eq, gt, projects, twinEvents, type Db } from '@afterlife/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const DosFile = z.string().regex(/^[A-Z0-9_-]{1,8}\.DBF$/i, 'a DBF file name');
const Table = z.object({
  key: z.string().nullable(),
  inserted: z.array(z.unknown()),
  deleted: z.array(z.unknown()),
  updated: z.array(z.unknown()),
  schema: z.object({ added: z.array(z.string()), removed: z.array(z.string()) }),
});
export const TwinEventBody = z
  .object({
    seq: z.number().int().positive(),
    occurredAt: z.iso.datetime(),
    files: z.array(DosFile).max(64),
    diff: z.object({
      tables: z.record(DosFile, Table),
      unchanged: z.array(DosFile),
      addedTables: z.array(DosFile),
      removedTables: z.array(DosFile),
    }),
  })
  .strict();
export type TwinEventBodyT = z.infer<typeof TwinEventBody>;

export type TwinListed = {
  seq: number;
  occurredAt: string;
  files: string[];
  matched: boolean | null;
  oldResult: unknown;
  newResult: unknown;
};

export interface TwinStore {
  /** A new token for the project (the old one stops working). Null: no such project. */
  newToken(projectId: string): Promise<string | null>;
  /** True when the token is the project's. */
  checkToken(projectId: string, token: string): Promise<boolean>;
  /** Stores an event; false when its seq is already there. */
  add(projectId: string, e: TwinEventBodyT): Promise<boolean>;
  list(projectId: string, after?: number): Promise<TwinListed[]>;
}

export class PgTwinStore implements TwinStore {
  constructor(private readonly db: Db) {}
  async newToken(projectId: string) {
    const token = `tw_${randomBytes(32).toString('base64url')}`;
    const r = await this.db
      .update(projects)
      .set({ twinTokenHash: sha256(token) })
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });
    return r.length ? token : null;
  }
  async checkToken(projectId: string, token: string) {
    const [p] = await this.db
      .select({ hash: projects.twinTokenHash })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!p?.hash) return false;
    const [a, b] = [Buffer.from(p.hash, 'hex'), Buffer.from(sha256(token), 'hex')];
    return a.length === b.length && timingSafeEqual(a, b);
  }
  async add(projectId: string, e: TwinEventBodyT) {
    const r = await this.db
      .insert(twinEvents)
      .values({
        projectId,
        seq: e.seq,
        occurredAt: new Date(e.occurredAt),
        event: { files: e.files, diff: e.diff },
      })
      .onConflictDoNothing({ target: [twinEvents.projectId, twinEvents.seq] })
      .returning({ id: twinEvents.id });
    if (!r.length) return false;
    const counts = Object.fromEntries(
      Object.entries(e.diff.tables).map(([f, t]) => [
        f,
        { inserted: t.inserted.length, updated: t.updated.length, deleted: t.deleted.length },
      ]),
    );
    await emitEvent(this.db, projectId, 'twin', {
      seq: e.seq,
      occurredAt: e.occurredAt,
      files: e.files,
      counts,
    });
    return true;
  }
  async list(projectId: string, after = 0) {
    const rows = await this.db
      .select()
      .from(twinEvents)
      .where(and(eq(twinEvents.projectId, projectId), gt(twinEvents.seq, after)))
      .orderBy(asc(twinEvents.seq))
      .limit(500);
    return rows.map((r) => ({
      seq: r.seq,
      occurredAt: r.occurredAt.toISOString(),
      files: (r.event as { files?: string[] }).files ?? [],
      matched: r.matched,
      oldResult: r.oldResult,
      newResult: r.newResult,
    }));
  }
}

const Id = z.uuid();

export function twinRoutes(store: TwinStore | undefined) {
  return async (app: FastifyInstance) => {
    const bad = (id: string) =>
      !Id.safeParse(id).success
        ? { code: 400, error: 'BAD_ID', message: 'Not an id' }
        : !store
          ? { code: 503, error: 'NO_DATABASE', message: 'This API has no database' }
          : null;
    app.post<{ Params: { id: string } }>('/api/projects/:id/twin/token', async (req, reply) => {
      const b = bad(req.params.id);
      if (b) return reply.code(b.code).send({ error: b.error, message: b.message });
      const token = await store!.newToken(req.params.id);
      if (!token) return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' });
      // Shown this once: only its hash is kept.
      return reply.code(201).header('cache-control', 'no-store').send({ token });
    });
    app.post<{ Params: { id: string }; Body: unknown }>(
      '/api/projects/:id/twin/events',
      { bodyLimit: 2 * 1024 * 1024 },
      async (req, reply) => {
        const b = bad(req.params.id);
        if (b) return reply.code(b.code).send({ error: b.error, message: b.message });
        const auth = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
        if (!auth || !(await store!.checkToken(req.params.id, auth)))
          return reply.code(401).send({
            error: 'BAD_TOKEN',
            message: "Send the project's twin token (Ghost Twin tab)",
          });
        const body = TwinEventBody.safeParse(req.body);
        if (!body.success)
          return reply.code(400).send({
            error: 'BAD_EVENT',
            message: body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          });
        if (!(await store!.add(req.params.id, body.data)))
          return reply
            .code(409)
            .send({ error: 'DUPLICATE', message: `Change ${body.data.seq} is already here` });
        return reply.code(201).send({ seq: body.data.seq });
      },
    );
    app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
      '/api/projects/:id/twin/events',
      async (req, reply) => {
        const b = bad(req.params.id);
        if (b) return reply.code(b.code).send({ error: b.error, message: b.message });
        const after = Math.max(0, Number(req.query.after ?? 0) || 0);
        return { events: await store!.list(req.params.id, after) };
      },
    );
  };
}
