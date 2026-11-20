// Rule checking (Prompt 55), for the Soul tab's "Check a rule" panel: the values the old app wrote
// (each a rule target), and any candidate rules checked against every observation of the project,
// by the same deterministic code the Archaeologist uses. Only numbers and observation ids come
// back, never the records, so a real shop's names stay in its observations.
import {
  effectsOf,
  entityIdFor,
  targetOf,
  verifyCandidates,
  type EffectObservation,
  type Verification,
  type VerifyEntity,
} from '@afterlife/crew';
import type { SnapshotDiff } from '@afterlife/dbf';
import { asc, eq, latestSoulRow, observations, sessions, sql, type Db } from '@afterlife/db';
import { SoulSchema } from '@afterlife/soul';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

/** The most observations a check reads: a long possession is a few thousand. */
export const MAX_EVIDENCE = 5000;

export interface RuleEvidenceStore {
  /** The project's observations (oldest first) and its entities (the latest Soul's, if any). */
  evidence(
    projectId: string,
  ): Promise<{ observations: EffectObservation[]; entities: VerifyEntity[] }>;
}

/** Entities from the data files the observations touched, for a project with no Soul yet. */
export function entitiesFromDiffs(diffs: SnapshotDiff[]): VerifyEntity[] {
  const out = new Map<string, VerifyEntity>();
  for (const d of diffs)
    for (const [file, t] of Object.entries(d.tables))
      if (!out.has(file.toUpperCase()))
        out.set(file.toUpperCase(), {
          id: entityIdFor(file),
          file: file.toUpperCase(),
          key: t.key ? [t.key] : [],
        });
  return [...out.values()];
}

export class PgRuleEvidenceStore implements RuleEvidenceStore {
  constructor(private readonly db: Db) {}
  async evidence(projectId: string) {
    const rows = await this.db
      .select({
        id: observations.id,
        keys: observations.keys,
        dbfDiff: observations.dbfDiff,
      })
      .from(observations)
      // Its own observations, and those of the séances recorded on it.
      .leftJoin(sessions, eq(sessions.id, observations.sessionId))
      .where(sql`${observations.projectId} = ${projectId} OR ${sessions.projectId} = ${projectId}`)
      .orderBy(asc(observations.createdAt), asc(observations.seq))
      .limit(MAX_EVIDENCE);
    const obs: EffectObservation[] = rows.map((r) => ({
      id: r.id,
      keys: r.keys,
      screenBefore: {},
      dbfDiff: r.dbfDiff as SnapshotDiff,
    }));
    const soul = await latestSoulRow(this.db, projectId);
    const entities = soul
      ? SoulSchema.parse(soul.ir).entities
      : entitiesFromDiffs(obs.map((o) => o.dbfDiff));
    return { observations: obs, entities };
  }
}

const Id = z.uuid();
const Target = z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/);
export const VerifyBody = z.object({
  target: Target,
  candidates: z.array(z.string().trim().min(1).max(2000)).min(1).max(10),
});

export function ruleRoutes(
  store: RuleEvidenceStore | undefined,
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
          message: 'This API has no database, so it has no observations to check rules on',
        });
      if (!(await opts.projectExists(id)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' });
      return null;
    };

    // The values the old app wrote: each one a rule could explain, with how often it was seen.
    app.get<{ Params: { id: string } }>('/api/projects/:id/rules/targets', async (req, reply) => {
      const stop = await guard(req.params.id, reply);
      if (stop) return stop;
      const { observations: obs, entities } = await store!.evidence(req.params.id);
      const by = new Map<string, { kind: string; effects: number; observations: Set<string> }>();
      for (const e of effectsOf(obs, entities)) {
        const t = targetOf(e);
        const x = by.get(t) ?? { kind: e.kind, effects: 0, observations: new Set<string>() };
        x.effects++;
        x.observations.add(e.observation);
        by.set(t, x);
      }
      return {
        projectId: req.params.id,
        observations: obs.length,
        targets: [...by]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([target, x]) => ({
            target,
            kind: x.kind,
            effects: x.effects,
            observations: x.observations.size,
          })),
      };
    });

    app.post<{ Params: { id: string } }>('/api/projects/:id/rules/verify', async (req, reply) => {
      const stop = await guard(req.params.id, reply);
      if (stop) return stop;
      const body = VerifyBody.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send({
          error: 'BAD_REQUEST',
          message: body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        });
      const { observations: obs, entities } = await store!.evidence(req.params.id);
      const v: Verification = verifyCandidates(
        body.data.target,
        body.data.candidates,
        obs,
        entities,
      );
      return { projectId: req.params.id, ...v };
    });
  };
}
