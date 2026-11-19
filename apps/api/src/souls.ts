// A project's Soul (Prompt 44) and the observations its rules point at as evidence.
// POST /api/projects/:id/souls stores a new version; versions are never changed (Prompt 45).
import {
  observations,
  sessions,
  souls,
  and,
  asc,
  desc,
  eq,
  insertSoulVersion,
  sql,
  type Db,
} from '@afterlife/db';
import {
  SoulSchema,
  diffSouls,
  numberSoul,
  specRequirements,
  summarizeDiff,
  type Soul,
} from '@afterlife/soul';
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

export type VersionRow = {
  version: number;
  createdAt: string;
  createdBy: string;
  rules: number;
  /** Against the version before; null for the first. */
  changes: ReturnType<typeof summarizeDiff> | null;
};

/** Observations listed at most at once (the newest). */
export const OBSERVATIONS_PAGE = 500;

export interface SoulStore {
  latest(projectId: string): Promise<{ version: number; soul: Soul } | null>;
  version(projectId: string, version: number): Promise<{ version: number; soul: Soul } | null>;
  /** Newest first, each with what changed since the version before it. */
  versions(projectId: string): Promise<VersionRow[]>;
  /** Stores the Soul as the next version. Returns that version. */
  add(projectId: string, soul: Soul): Promise<number>;
  /** The newest 500, oldest first, and how many there are in all. */
  listObservations(projectId: string): Promise<{ rows: ObservationRow[]; total: number }>;
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

  async version(projectId: string, version: number) {
    const [row] = await this.db
      .select()
      .from(souls)
      .where(and(eq(souls.projectId, projectId), eq(souls.version, version)));
    return row ? { version: row.version, soul: SoulSchema.parse(row.ir) } : null;
  }

  async versions(projectId: string): Promise<VersionRow[]> {
    const rows = await this.db
      .select()
      .from(souls)
      .where(eq(souls.projectId, projectId))
      .orderBy(asc(souls.version));
    const parsed = rows.map((r) => ({ row: r, soul: SoulSchema.parse(r.ir) }));
    return parsed
      .map(({ row, soul }, i) => ({
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        createdBy: soul.provenance.createdBy,
        rules: soul.rules.length,
        changes: i === 0 ? null : summarizeDiff(diffSouls(parsed[i - 1]!.soul, soul)),
      }))
      .reverse();
  }

  async add(projectId: string, soul: Soul): Promise<number> {
    // One writer at a time per project, so two versions never get the same number.
    return insertSoulVersion(this.db, projectId, (version, parent) => {
      const stored = numberSoul(soul, projectId, version, parent);
      return { ir: stored, specMarkdown: specRequirements(stored) };
    });
  }

  async listObservations(projectId: string): Promise<{ rows: ObservationRow[]; total: number }> {
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
      // The newest: on a long possession the evidence a rule needs is the latest (review 41-50).
      .orderBy(desc(observations.createdAt), desc(observations.seq))
      .limit(OBSERVATIONS_PAGE);
    const [count] = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(observations)
      .leftJoin(sessions, eq(sessions.id, observations.sessionId))
      .where(sql`${observations.projectId} = ${projectId} OR ${sessions.projectId} = ${projectId}`);
    const list = rows.reverse().map((r) => ({
      id: r.id,
      seq: r.seq,
      sessionId: r.sessionId,
      keys: r.keys,
      before: title(r.screenBefore),
      after: title(r.screenAfter),
      changed: Object.keys((r.dbfDiff as { tables?: object })?.tables ?? {}).sort(),
    }));
    return { rows: list, total: Number(count?.n ?? 0) };
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
const Version = z.coerce.number().int().min(1).max(1_000_000);
const noDatabase = {
  error: 'NO_DATABASE',
  message: 'This API has no database, so it keeps no Souls',
};

export function soulRoutes(
  store: SoulStore | undefined,
  opts: {
    projectExists: (id: string) => Promise<boolean>;
    createPerMinute: number;
    /** Queues the Urdu translation job (Prompt 46). */
    translate?: (projectId: string) => Promise<boolean>;
  },
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

    // The worker translates the newest Soul's rules into Urdu and stores the next version.
    app.post<{ Params: { id: string } }>(
      '/api/projects/:id/soul/translate',
      { config: { rateLimit: { max: opts.createPerMinute, timeWindow: '1 minute' } } },
      async (req, reply) => {
        if (!(await project(req.params.id, reply))) return reply;
        if (!(await store!.latest(req.params.id)))
          return reply
            .code(404)
            .send({ error: 'NO_SOUL', message: 'No Soul has been written for this project yet' });
        if (!opts.translate)
          return reply
            .code(503)
            .send({ error: 'NO_WORKER', message: 'This API cannot queue work for the worker' });
        if (!(await opts.translate(req.params.id)))
          return reply
            .code(409)
            .send({ error: 'ALREADY_QUEUED', message: 'A translation is already waiting to run' });
        return reply.code(202).send({ queued: true });
      },
    );

    app.get<{ Params: { id: string } }>('/api/projects/:id/souls', async (req, reply) => {
      if (!(await project(req.params.id, reply))) return reply;
      return { projectId: req.params.id, versions: await store!.versions(req.params.id) };
    });

    // Before /souls/:version, so `compare` is not read as a version number.
    app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
      '/api/projects/:id/souls/compare',
      async (req, reply) => {
        if (!(await project(req.params.id, reply))) return reply;
        const from = Version.safeParse(req.query.from);
        const to = Version.safeParse(req.query.to);
        if (!from.success || !to.success)
          return reply
            .code(400)
            .send({ error: 'BAD_VERSION', message: 'Give ?from= and ?to= as version numbers' });
        const [a, b] = await Promise.all([
          store!.version(req.params.id, from.data),
          store!.version(req.params.id, to.data),
        ]);
        if (!a || !b)
          return reply.code(404).send({ error: 'NO_VERSION', message: 'No such version' });
        return { projectId: req.params.id, diff: diffSouls(a.soul, b.soul) };
      },
    );

    app.get<{ Params: { id: string; version: string } }>(
      '/api/projects/:id/souls/:version',
      async (req, reply) => {
        if (!(await project(req.params.id, reply))) return reply;
        const v = Version.safeParse(req.params.version);
        if (!v.success)
          return reply.code(400).send({ error: 'BAD_VERSION', message: 'Not a version number' });
        const s = await store!.version(req.params.id, v.data);
        return s ?? reply.code(404).send({ error: 'NO_VERSION', message: 'No such version' });
      },
    );

    app.get<{ Params: { id: string } }>('/api/projects/:id/observations', async (req, reply) => {
      if (!(await project(req.params.id, reply))) return reply;
      return {
        projectId: req.params.id,
        ...(await store!.listObservations(req.params.id).then((r) => ({
          observations: r.rows,
          total: r.total,
        }))),
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
