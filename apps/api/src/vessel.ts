// The reborn app's server side (Prompt 60). Phones sync the sales they made, offline or not; the
// server replays each one with the Vessel runtime on its own records (vessel_records) and keeps
// what it made of it (vessel_sync), so each sale is applied once. The records start as the old
// app's own data files, the same ones the phone starts from.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DbfRecord } from '@afterlife/dbf';
import {
  SEED_PROJECTS,
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  latestSoulRow,
  vesselSync,
  type Db,
} from '@afterlife/db';
import { SoulSchema, type Soul } from '@afterlife/soul';
import {
  ConflictError,
  replaySale,
  seedStore,
  type SyncItem,
  type SyncResult,
} from '@afterlife/vessel';
import { PgEntityStore } from '@afterlife/vessel/postgres';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export const MAX_SYNC_ITEMS = 200;
const GRAVEYARD = new Set<string>(SEED_PROJECTS.map((p) => p.sourceApp));

/** The js-dos bundle of a Graveyard app (its data files are the first records), or null. */
export function graveyardBundle(p: { source: string; sourceApp: string }): Uint8Array | null {
  if (p.source !== 'graveyard' || !GRAVEYARD.has(p.sourceApp)) return null;
  const file = new URL(`../../web/public/graveyard/${p.sourceApp}.jsdos`, import.meta.url);
  return new Uint8Array(readFileSync(fileURLToPath(file)));
}

export type Conflicted = {
  id: string;
  at: string;
  record: string | null;
  conflicts: SyncResult['conflicts'];
};

export interface VesselStore {
  sync(projectId: string, items: SyncItem[]): Promise<SyncResult[]>;
  records(projectId: string): Promise<Record<string, DbfRecord[]> | null>;
  conflicts(projectId: string): Promise<Conflicted[]>;
  review(projectId: string, id: string): Promise<boolean>;
}

/** The sync could not run at all: no Soul, no records to start from. */
export class VesselSyncError extends Error {
  constructor(
    readonly code: 'NO_SOUL' | 'NO_ACTIONS' | 'NO_DATA',
    message: string,
  ) {
    super(message);
  }
}

export class PgVesselStore implements VesselStore {
  constructor(
    private readonly db: Db,
    private readonly project: (id: string) => Promise<{ source: string; sourceApp: string } | null>,
    private readonly bundleFor: typeof graveyardBundle = graveyardBundle,
  ) {}

  private async soul(projectId: string): Promise<Soul> {
    const row = await latestSoulRow(this.db, projectId);
    if (!row) throw new VesselSyncError('NO_SOUL', 'No Soul has been written for this project yet');
    const soul = SoulSchema.parse(row.ir);
    if (!soul.actions.length)
      throw new VesselSyncError(
        'NO_ACTIONS',
        'The Soul has no actions, so there is nothing to sync',
      );
    return soul;
  }

  /** The project's records, seeded from the old app's data files the first time. */
  private async store(projectId: string, soul: Soul): Promise<PgEntityStore> {
    const store = new PgEntityStore(this.db, projectId);
    if ((await store.files()).length) return store;
    const p = await this.project(projectId);
    const bundle = p ? this.bundleFor(p) : null;
    if (!bundle)
      throw new VesselSyncError(
        'NO_DATA',
        'The records of an uploaded app come with the Undertaker',
      );
    await seedStore(store, bundle, soul);
    return store;
  }

  async sync(projectId: string, items: SyncItem[]) {
    const soul = await this.soul(projectId);
    const store = await this.store(projectId, soul);
    const done = items.length
      ? await this.db
          .select({ id: vesselSync.id, result: vesselSync.result, projectId: vesselSync.projectId })
          .from(vesselSync)
          .where(
            inArray(
              vesselSync.id,
              items.map((i) => i.id),
            ),
          )
      : [];
    const out: SyncResult[] = [];
    for (const item of items) {
      const before = done.find((d) => d.id === item.id);
      if (before) {
        // Sent again (the answer was lost on the way): the same answer, applied once.
        out.push(
          before.projectId === projectId
            ? (before.result as SyncResult)
            : {
                id: item.id,
                ok: false,
                message: 'This sale belongs to another project',
                conflicts: [],
              },
        );
        continue;
      }
      let r: SyncResult | null = null;
      // Another phone's sale may land between reading and writing: read again and redo it.
      for (let attempt = 0; attempt < 5 && !r; attempt++) {
        try {
          r = await replaySale(soul, store, item);
        } catch (e) {
          if (!(e instanceof ConflictError) || attempt === 4) throw e;
        }
      }
      const inserted = await this.db
        .insert(vesselSync)
        .values({
          id: item.id,
          projectId,
          actionId: item.actionId,
          item,
          result: r!,
          conflicts: r!.conflicts.length,
        })
        .onConflictDoNothing()
        .returning({ id: vesselSync.id });
      if (!inserted.length) {
        // A second request with the same sale got here first; it has been applied once.
        const [row] = await this.db
          .select({ result: vesselSync.result })
          .from(vesselSync)
          .where(eq(vesselSync.id, item.id));
        out.push(row!.result as SyncResult);
      } else out.push(r!);
    }
    return out;
  }

  async records(projectId: string) {
    const store = new PgEntityStore(this.db, projectId);
    const files = await store.files();
    if (!files.length) return null;
    return Object.fromEntries(
      await Promise.all(files.map(async (f) => [f, await store.records(f)] as const)),
    );
  }

  async conflicts(projectId: string) {
    const rows = await this.db
      .select()
      .from(vesselSync)
      .where(
        and(
          eq(vesselSync.projectId, projectId),
          gt(vesselSync.conflicts, 0),
          isNull(vesselSync.reviewedAt),
        ),
      )
      .orderBy(desc(vesselSync.createdAt));
    return rows.map((r) => {
      const result = r.result as SyncResult;
      return {
        id: r.id,
        at: (r.item as SyncItem).at,
        record: result.renumbered?.server ?? null,
        conflicts: result.conflicts,
      };
    });
  }

  async review(projectId: string, id: string) {
    const rows = await this.db
      .update(vesselSync)
      .set({ reviewedAt: new Date() })
      .where(and(eq(vesselSync.id, id), eq(vesselSync.projectId, projectId)))
      .returning({ id: vesselSync.id });
    return rows.length > 0;
  }
}

const Id = z.uuid();
const Value = z.union([z.string().max(254), z.boolean(), z.number(), z.null()]);
const Values = z.record(z.string().max(10), Value);
const Ref = z.object({
  key: z.string().nullable(),
  recno: z.number().int().min(0),
  values: Values,
});
const TableDiffSchema = z.object({
  key: z.string().nullable(),
  inserted: z.array(Ref).max(500),
  deleted: z.array(Ref).max(500),
  updated: z
    .array(
      z.object({
        key: z.string().nullable(),
        beforeRecno: z.number().int().min(0),
        afterRecno: z.number().int().min(0),
        changes: z.array(
          z.object({
            field: z.string(),
            before: Value,
            after: Value,
            delta: z.string().nullable().optional(),
          }),
        ),
      }),
    )
    .max(500),
  schema: z.object({ added: z.array(z.string()), removed: z.array(z.string()) }),
});
const Item = z.object({
  id: Id,
  actionId: z.string().min(1).max(48),
  inputs: z.object({
    values: z.record(z.string().max(10), z.string().max(254)).optional(),
    lines: z
      .array(z.record(z.string().max(10), z.string().max(254)))
      .max(200)
      .optional(),
  }),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  at: z.iso.datetime(),
  effects: z.object({
    tables: z.record(z.string().max(12), TableDiffSchema),
    unchanged: z.array(z.string()),
    addedTables: z.array(z.string()),
    removedTables: z.array(z.string()),
  }),
  record: Values,
});
export const SyncBody = z.object({ items: z.array(Item).max(MAX_SYNC_ITEMS) });

export function vesselRoutes(
  store: VesselStore | undefined,
  opts: { projectExists: (id: string) => Promise<boolean> },
) {
  return async (app: FastifyInstance) => {
    const guard = async (
      id: string,
      reply: { code: (n: number) => { send: (b: unknown) => unknown } },
    ) => {
      if (!Id.safeParse(id).success)
        return reply.code(400).send({ error: 'BAD_ID', message: 'Not an id' });
      if (!store)
        return reply.code(503).send({
          error: 'NO_DATABASE',
          message: 'This API has no database, so it cannot keep the reborn app’s records',
        });
      if (!(await opts.projectExists(id)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' });
      return null;
    };

    app.post<{ Params: { id: string } }>(
      '/api/projects/:id/vessel/sync',
      { bodyLimit: 4 * 1024 * 1024 },
      async (req, reply) => {
        const stop = await guard(req.params.id, reply);
        if (stop) return stop;
        const body = SyncBody.safeParse(req.body);
        if (!body.success)
          return reply.code(400).send({
            error: 'BAD_REQUEST',
            message: body.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
          });
        try {
          return { results: await store!.sync(req.params.id, body.data.items as SyncItem[]) };
        } catch (e) {
          if (e instanceof VesselSyncError)
            return reply.code(409).send({ error: e.code, message: e.message });
          throw e;
        }
      },
    );

    app.get<{ Params: { id: string } }>('/api/projects/:id/vessel/records', async (req, reply) => {
      const stop = await guard(req.params.id, reply);
      if (stop) return stop;
      const files = await store!.records(req.params.id);
      if (!files)
        return reply
          .code(404)
          .send({ error: 'NO_RECORDS', message: 'No phone has synced with this project yet' });
      return { projectId: req.params.id, files };
    });

    app.get<{ Params: { id: string } }>(
      '/api/projects/:id/vessel/conflicts',
      async (req, reply) => {
        const stop = await guard(req.params.id, reply);
        if (stop) return stop;
        return { projectId: req.params.id, conflicts: await store!.conflicts(req.params.id) };
      },
    );

    app.post<{ Params: { id: string; sync: string } }>(
      '/api/projects/:id/vessel/conflicts/:sync/review',
      async (req, reply) => {
        const stop = await guard(req.params.id, reply);
        if (stop) return stop;
        if (!Id.safeParse(req.params.sync).success)
          return reply.code(400).send({ error: 'BAD_ID', message: 'Not an id' });
        if (!(await store!.review(req.params.id, req.params.sync)))
          return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such sale to review' });
        return { reviewed: true };
      },
    );
  };
}
