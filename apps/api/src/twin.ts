// Ghost Twin on the API (Prompt 76): the shop's capture tool (afterlife-twin) sends each change to
// the old app's data files here. Only with the project's twin token: the API has no login, so the
// token is what keeps anyone else from writing into a shop's twin. Only its SHA-256 is kept.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DbfRecord, SnapshotDiff } from '@afterlife/dbf';
import {
  and,
  asc,
  emitEvent,
  eq,
  gt,
  latestSoulRow,
  projects,
  sql,
  twinEvents,
  type Db,
} from '@afterlife/db';
import {
  DEFAULT_RULE,
  readiness,
  type Readiness,
  type ReadinessRule,
  type TwinResult,
} from '@afterlife/oracle';
import { SoulSchema } from '@afterlife/soul';
import { applyEffects, tablesFromBundle } from '@afterlife/vessel';
import { PgEntityStore } from '@afterlife/vessel/postgres';
import { graveyardBundle } from './vessel';
import type { FastifyInstance } from 'fastify';
import type { Pipeline } from './projects';
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

/** What the old app changed in each file: the twin feed's old side. */
export type ChangeCounts = Record<string, { inserted: number; updated: number; deleted: number }>;
const changeCounts = (diff: {
  tables: Record<string, { inserted: unknown[]; updated: unknown[]; deleted: unknown[] }>;
}): ChangeCounts =>
  Object.fromEntries(
    Object.entries(diff.tables).map(([f, t]) => [
      f,
      { inserted: t.inserted.length, updated: t.updated.length, deleted: t.deleted.length },
    ]),
  );
export type TwinListed = {
  seq: number;
  occurredAt: string;
  files: string[];
  changes: ChangeCounts;
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
  overview(projectId: string, rule: ReadinessRule): Promise<TwinOverview | null>;
  /** The next recorded shop day, added as twin events (demo mode). */
  simulate(projectId: string): Promise<{ day: string; events: number }>;
  switchOver(
    projectId: string,
    rule: ReadinessRule,
  ): Promise<{
    primaryApp: 'vessel';
    switchedAt: string;
    migrated: { events: number; files: string[] };
  }>;
}

export class TwinError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'NO_RECORDED_DAY'
      | 'WEEK_OVER'
      | 'NOT_READY'
      | 'SWITCHED'
      | 'NO_SOUL'
      | 'CONFLICT',
    message: string,
  ) {
    super(message);
  }
}
const TWIN_STATUS: Record<TwinError['code'], number> = {
  NOT_FOUND: 404,
  NO_RECORDED_DAY: 404,
  WEEK_OVER: 409,
  NOT_READY: 409,
  SWITCHED: 409,
  NO_SOUL: 409,
  CONFLICT: 409,
};

export type TwinDay = {
  date: string;
  total: number;
  matched: number;
  mismatched: number;
  unknown: number;
  pending: number;
};
export type TwinOverview = {
  readiness: Readiness;
  days: TwinDay[];
  primaryApp: 'old' | 'vessel';
  switchedAt: string | null;
  hasToken: boolean;
  simulate: { available: boolean; nextDay: string | null; recordedDays: number };
};

/** A recorded shop week of a Graveyard app (pnpm twin:record), for "simulate a day in the shop". */
type Week = {
  days: string[];
  events: { day: string; occurredAt: string; files: string[]; diff: SnapshotDiff }[];
};
const weeks = new Map<string, Week | null>();
export function recordedWeek(app: string): Week | null {
  if (!/^[a-z0-9-]+$/.test(app)) return null;
  if (!weeks.has(app)) {
    try {
      weeks.set(
        app,
        JSON.parse(
          readFileSync(
            fileURLToPath(
              new URL(`../../../samples/graveyard/${app}/twin-week.json`, import.meta.url),
            ),
            'utf8',
          ),
        ) as Week,
      );
    } catch {
      weeks.set(app, null);
    }
  }
  return weeks.get(app) ?? null;
}
const outcomeOf = (r: { matched: boolean | null; newResult: unknown }): TwinResult['outcome'] =>
  r.newResult === null
    ? null
    : r.matched === true
      ? 'matched'
      : r.matched === false
        ? 'mismatched'
        : 'unknown';

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
    const counts = changeCounts(e.diff);

    await emitEvent(this.db, projectId, 'twin', {
      seq: e.seq,
      occurredAt: e.occurredAt,
      files: e.files,
      counts,
    });
    return true;
  }
  private async project(projectId: string) {
    const [p] = await this.db.select().from(projects).where(eq(projects.id, projectId));
    return p ?? null;
  }
  async overview(projectId: string, rule: ReadinessRule): Promise<TwinOverview | null> {
    const p = await this.project(projectId);
    if (!p) return null;
    const rows = await this.db
      .select({
        occurredAt: twinEvents.occurredAt,
        matched: twinEvents.matched,
        newResult: twinEvents.newResult,
      })
      .from(twinEvents)
      .where(eq(twinEvents.projectId, projectId))
      .orderBy(asc(twinEvents.seq));
    const results = rows.map((r) => ({
      occurredAt: r.occurredAt.toISOString(),
      outcome: outcomeOf(r),
    }));
    const byDay = new Map<string, TwinDay>();
    for (const r of results) {
      const date = r.occurredAt.slice(0, 10);
      const d = byDay.get(date) ?? {
        date,
        total: 0,
        matched: 0,
        mismatched: 0,
        unknown: 0,
        pending: 0,
      };
      d.total++;
      d[r.outcome ?? 'pending']++;
      byDay.set(date, d);
    }
    const week = p.source === 'graveyard' ? recordedWeek(p.sourceApp) : null;
    const seen = new Set(byDay.keys());
    const nextDay = week?.days.find((d) => !seen.has(d)) ?? null;
    return {
      readiness: readiness(results, rule),
      days: [...byDay.values()],
      primaryApp: p.primaryApp === 'vessel' ? 'vessel' : 'old',
      switchedAt: p.switchedAt?.toISOString() ?? null,
      hasToken: !!p.twinTokenHash,
      simulate: {
        available: !!week && p.primaryApp !== 'vessel',
        nextDay: p.primaryApp === 'vessel' ? null : nextDay,
        recordedDays: week?.days.length ?? 0,
      },
    };
  }
  async simulate(projectId: string) {
    const p = await this.project(projectId);
    if (!p) throw new TwinError('NOT_FOUND', 'No such project');
    if (p.primaryApp === 'vessel')
      throw new TwinError('SWITCHED', "The shop has switched over: the old app's data is frozen");
    const week = p.source === 'graveyard' ? recordedWeek(p.sourceApp) : null;
    if (!week) throw new TwinError('NO_RECORDED_DAY', 'There is no recorded shop day for this app');
    const o = (await this.overview(projectId, DEFAULT_RULE))!;
    const day = o.simulate.nextDay;
    if (!day) throw new TwinError('WEEK_OVER', 'Every recorded day has been simulated');
    const [{ last }] = (await this.db
      .select({ last: sql<number>`coalesce(max(${twinEvents.seq}), 0)` })
      .from(twinEvents)
      .where(eq(twinEvents.projectId, projectId))) as [{ last: number }];
    let seq = Number(last);
    const events = week.events.filter((e) => e.day === day);
    for (const e of events)
      await this.add(projectId, {
        seq: ++seq,
        occurredAt: e.occurredAt,
        files: e.files,
        diff: e.diff as never,
      });
    return { day, events: events.length };
  }
  async switchOver(projectId: string, rule: ReadinessRule) {
    const p = await this.project(projectId);
    if (!p) throw new TwinError('NOT_FOUND', 'No such project');
    if (p.primaryApp === 'vessel')
      throw new TwinError('SWITCHED', 'The shop has already switched over');
    const o = (await this.overview(projectId, rule))!;
    if (!o.readiness.ready)
      throw new TwinError('NOT_READY', `Not ready to switch: ${o.readiness.reasons.join('; ')}`);
    const soulRow = await latestSoulRow(this.db, projectId);
    if (!soulRow) throw new TwinError('NO_SOUL', 'This project has no Soul yet');
    const soul = SoulSchema.parse(soulRow.ir);
    // The final migration: the shop's records as the old app left them, every change applied.
    const vessel = new PgEntityStore(this.db, projectId);
    const files = [...new Set(soul.entities.map((e) => e.file.toUpperCase()))];
    let records: Record<string, DbfRecord[]> = {};
    for (const f of files) records[f] = await vessel.records(f);
    if (files.every((f) => !records[f]!.length) && p.source === 'graveyard') {
      const bundle = graveyardBundle(p);
      if (bundle)
        records = Object.fromEntries(
          Object.entries(tablesFromBundle(bundle, soul)).map(([f, t]) => [
            f.toUpperCase(),
            t.records,
          ]),
        );
    }
    const rows = await this.db
      .select({ event: twinEvents.event })
      .from(twinEvents)
      .where(eq(twinEvents.projectId, projectId))
      .orderBy(asc(twinEvents.seq));
    try {
      for (const r of rows)
        records = {
          ...records,
          ...applyEffects(records, (r.event as { diff: SnapshotDiff }).diff),
        };
    } catch (e) {
      throw new TwinError(
        'CONFLICT',
        `The twin's records do not follow the old app's: ${(e as Error).message}`,
      );
    }
    for (const [f, rs] of Object.entries(records)) if (files.includes(f)) await vessel.load(f, rs);
    const switchedAt = new Date();
    // Frozen: from now on the reborn app is the shop's app.
    await this.db
      .update(projects)
      .set({ primaryApp: 'vessel', switchedAt })
      .where(eq(projects.id, projectId));
    return {
      primaryApp: 'vessel' as const,
      switchedAt: switchedAt.toISOString(),
      migrated: { events: rows.length, files },
    };
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
      changes: changeCounts((r.event as { diff: SnapshotDiff }).diff),
      matched: r.matched,
      oldResult: r.oldResult,
      newResult: r.newResult,
    }));
  }
}

const Id = z.uuid();

export function twinRoutes(
  store: TwinStore | undefined,
  pipeline?: Pipeline,
  rule: ReadinessRule = DEFAULT_RULE,
) {
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
        const o = await store!.overview(req.params.id, rule);
        if (o?.primaryApp === 'vessel')
          return reply.code(409).send({
            error: 'SWITCHED',
            message: "The shop has switched over: the old app's data is frozen",
          });
        if (!(await store!.add(req.params.id, body.data)))
          return reply
            .code(409)
            .send({ error: 'DUPLICATE', message: `Change ${body.data.seq} is already here` });
        // The reborn app replays it (the worker's twin-replay step); one run takes all new ones.
        await pipeline?.twin?.(req.params.id);
        return reply.code(201).send({ seq: body.data.seq });
      },
    );
    const fail = (reply: import('fastify').FastifyReply, e: unknown) => {
      if (e instanceof TwinError)
        return reply.code(TWIN_STATUS[e.code]).send({ error: e.code, message: e.message });
      throw e;
    };
    app.get<{ Params: { id: string } }>('/api/projects/:id/twin', async (req, reply) => {
      const b = bad(req.params.id);
      if (b) return reply.code(b.code).send({ error: b.error, message: b.message });
      const o = await store!.overview(req.params.id, rule);
      return o ?? reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' });
    });
    app.post<{ Params: { id: string } }>('/api/projects/:id/twin/simulate', async (req, reply) => {
      const b = bad(req.params.id);
      if (b) return reply.code(b.code).send({ error: b.error, message: b.message });
      try {
        const r = await store!.simulate(req.params.id);
        await pipeline?.twin?.(req.params.id);
        return reply.code(201).send(r);
      } catch (e) {
        return fail(reply, e);
      }
    });
    app.post<{ Params: { id: string }; Body: unknown }>(
      '/api/projects/:id/twin/switch',
      async (req, reply) => {
        const b = bad(req.params.id);
        if (b) return reply.code(b.code).send({ error: b.error, message: b.message });
        if ((req.body as { confirm?: unknown } | null)?.confirm !== true)
          return reply
            .code(400)
            .send({ error: 'NOT_CONFIRMED', message: 'Send { "confirm": true } to switch over' });
        try {
          return await store!.switchOver(req.params.id, rule);
        } catch (e) {
          return fail(reply, e);
        }
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
