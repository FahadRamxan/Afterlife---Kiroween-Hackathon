// A project's Soul (Prompt 44) and the observations its rules point at as evidence.
// POST /api/projects/:id/souls stores a new version; versions are never changed (Prompt 45).
import { observations, sessions, souls, asc, desc, eq, sql, type Db } from '@afterlife/db';
import { SoulSchema, writeKiroSpec, type Soul } from '@afterlife/soul';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export type ObservationRow = {
  id: string;
  seq: number;
  sessionId: string | null;
  keys: string;
  before: string;
  after: string;
  changed: string[];
};

export interface SoulStore {
  latest(projectId: string): Promise<{ version: number; soul: Soul } | null>;
  /** Stores the Soul as the next version. Returns that version. */
  add(projectId: string, soul: Soul): Promise<number>;
  listObservations(projectId: string): Promise<ObservationRow[]>;
  observation(id: string): Promise<Record<string, unknown> | null>;
}

const title = (screen: unknown) =>
  ((screen as { model?: { title?: { name?: string } } })?.model?.title?.name ?? '').trim();

export class PgSoulStore implements SoulStore {
  constructor(private readonly db: Db) {}

  async latest(projectId: string) {
    const [row] = await this.db
      .select()
      .from(souls)
      .where(eq(souls.projectId, projectId))
      .orderBy(desc(souls.version))
      .limit(1);
    return row ? { version: row.version, soul: SoulSchema.parse(row.ir) } : null;
  }

  async add(projectId: string, soul: Soul): Promise<number> {
    return this.db.transaction(async (tx) => {
      // One writer at a time per project, so two versions never get the same number.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${projectId}))`);
      const [last] = await tx
        .select({ v: souls.version })
        .from(souls)
        .where(eq(souls.projectId, projectId))
        .orderBy(desc(souls.version))
        .limit(1);
      const version = (last?.v ?? 0) + 1;
      const stored: Soul = {
        ...soul,
        version,
        provenance: {
          ...soul.provenance,
          projectId,
          ...(last ? { parentVersion: last.v } : {}),
        },
      };
      const spec = writeKiroSpec(stored);
      const requirements = Object.entries(spec).find(([k]) => k.endsWith('requirements.md'))![1];
      await tx.insert(souls).values({ projectId, version, ir: stored, specMarkdown: requirements });
      return version;
    });
  }

  async listObservations(projectId: string): Promise<ObservationRow[]> {
    // A project's observations: its own, and those of the séances recorded on it.
    const rows = await this.db
      .select({
        id: observations.id,
        seq: observations.seq,
        sessionId: observations.sessionId,
        keys: observations.keys,
        screenBefore: observations.screenBefore,
        screenAfter: observations.screenAfter,
        dbfDiff: observations.dbfDiff,
      })
      .from(observations)
      .leftJoin(sessions, eq(sessions.id, observations.sessionId))
      .where(sql`${observations.projectId} = ${projectId} OR ${sessions.projectId} = ${projectId}`)
      .orderBy(asc(observations.createdAt), asc(observations.seq))
      .limit(500);
    return rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      sessionId: r.sessionId,
      keys: r.keys,
      before: title(r.screenBefore),
      after: title(r.screenAfter),
      changed: Object.keys((r.dbfDiff as { tables?: object })?.tables ?? {}).sort(),
    }));
  }

  async observation(id: string) {
    const [r] = await this.db.select().from(observations).where(eq(observations.id, id));
    if (!r) return null;
    return {
      id: r.id,
      sessionId: r.sessionId,
      seq: r.seq,
      keys: r.keys,
      screenBefore: r.screenBefore,
      screenAfter: r.screenAfter,
      dbfDiff: r.dbfDiff,
      durationMs: r.durationMs,
    };
  }
}

const Id = z.uuid();
const noDatabase = {
  error: 'NO_DATABASE',
  message: 'This API has no database, so it keeps no Souls',
};

export function soulRoutes(
  store: SoulStore | undefined,
  opts: { projectExists: (id: string) => Promise<boolean>; createPerMinute: number },
) {
  return async (app: FastifyInstance) => {
    const bad = (reply: { code(n: number): { send(b: unknown): unknown } }) =>
      reply.code(400).send({ error: 'BAD_ID', message: 'Not an id' });
    const project = async (id: string, reply: Parameters<typeof bad>[0]) => {
      if (!Id.safeParse(id).success) return (bad(reply), false);
      if (!store) return (reply.code(503).send(noDatabase), false);
      if (!(await opts.projectExists(id)))
        return (reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' }), false);
      return true;
    };

    app.get<{ Params: { id: string } }>('/api/projects/:id/soul', async (req, reply) => {
      if (!(await project(req.params.id, reply))) return reply;
      const s = await store!.latest(req.params.id);
      if (!s)
        return reply
          .code(404)
          .send({ error: 'NO_SOUL', message: 'No Soul has been written for this project yet' });
      return s;
    });

    app.post<{ Params: { id: string } }>(
      '/api/projects/:id/souls',
      {
        bodyLimit: 2 * 1024 * 1024,
        config: { rateLimit: { max: opts.createPerMinute, timeWindow: '1 minute' } },
      },
      async (req, reply) => {
        if (!(await project(req.params.id, reply))) return reply;
        const parsed = SoulSchema.safeParse(req.body);
        if (!parsed.success)
          return reply.code(400).send({
            error: 'BAD_SOUL',
            message: parsed.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.') || '(soul)'}: ${i.message}`)
              .join('; '),
          });
        return reply.code(201).send({ version: await store!.add(req.params.id, parsed.data) });
      },
    );

    app.get<{ Params: { id: string } }>('/api/projects/:id/observations', async (req, reply) => {
      if (!(await project(req.params.id, reply))) return reply;
      return {
        projectId: req.params.id,
        observations: await store!.listObservations(req.params.id),
      };
    });

    app.get<{ Params: { id: string } }>('/api/observations/:id', async (req, reply) => {
      if (!Id.safeParse(req.params.id).success) return bad(reply);
      if (!store) return reply.code(503).send(noDatabase);
      const o = await store.observation(req.params.id);
      return o ?? reply.code(404).send({ error: 'NOT_FOUND', message: 'No such observation' });
    });
  };
}
