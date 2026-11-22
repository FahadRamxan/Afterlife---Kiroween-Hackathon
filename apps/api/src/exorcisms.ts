// Keep or fix (Prompt 74) on the API: the Exorcist's findings for a project, and the owner's
// choice for each. A choice that changes a rule writes a new Soul version and proves it again.
import {
  DecisionError,
  SEVERITY_ORDER,
  decideExorcism,
  findingOf,
  remedyFor,
  type Decision,
  type StoredFinding,
} from '@afterlife/crew';
import { asc, eq, exorcisms, latestSoulRow, type Db } from '@afterlife/db';
import { SoulSchema } from '@afterlife/soul';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Pipeline } from './projects';

export type ExorcismView = {
  code: string;
  smell: string;
  severity: string;
  target: string | null;
  titleEn: string;
  titleUr: string;
  en: string;
  ur: string;
  since: number | null;
  evidence: { kind: string; ref: string; text: string }[];
  decision: 'pending' | 'keep' | 'fix';
  decidedAt: string | null;
  fixable: boolean;
  why: string | null;
  fixEn: string;
  fixUr: string;
};

export interface ExorcismStore {
  list(projectId: string): Promise<ExorcismView[]>;
  decide(
    projectId: string,
    code: string,
    decision: Decision,
  ): Promise<{ decision: Decision; soulVersion: number; changed: boolean }>;
}

export class PgExorcismStore implements ExorcismStore {
  constructor(private readonly db: Db) {}
  async list(projectId: string): Promise<ExorcismView[]> {
    const rows = await this.db
      .select()
      .from(exorcisms)
      .where(eq(exorcisms.projectId, projectId))
      .orderBy(asc(exorcisms.createdAt));
    const latest = await latestSoulRow(this.db, projectId);
    const soul = latest ? SoulSchema.safeParse(latest.ir) : null;
    return rows
      .map((row) => {
        const f = findingOf(row);
        const stored = row.evidence as StoredFinding;
        // Decided: the remedy as it was; pending: as it would be on the newest Soul.
        const remedy = stored.remedy ?? (soul?.success ? remedyFor(f, soul.data) : null);
        return {
          code: row.code,
          smell: f.smell,
          severity: row.severity,
          target: f.target ?? null,
          titleEn: row.titleEn,
          titleUr: row.titleUr,
          en: f.en,
          ur: f.ur,
          since: f.since,
          evidence: f.evidence,
          decision: row.decision,
          decidedAt: row.decidedAt?.toISOString() ?? null,
          fixable: !!remedy?.fix,
          why: remedy?.fix ? null : (remedy?.why ?? 'There is no Soul to fix yet'),
          fixEn: remedy?.fixEn ?? '',
          fixUr: remedy?.fixUr ?? '',
        };
      })
      .sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity as never) - SEVERITY_ORDER.indexOf(b.severity as never),
      );
  }
  async decide(projectId: string, code: string, decision: Decision) {
    const r = await decideExorcism(this.db, projectId, code, decision);
    return { decision: r.decision, soulVersion: r.soulVersion, changed: r.changed };
  }
}

const Id = z.uuid();
const Body = z.object({ decision: z.enum(['keep', 'fix']) });
const STATUS: Record<DecisionError['code'], number> = {
  NOT_FOUND: 404,
  ALREADY_DECIDED: 409,
  NOT_FIXABLE: 409,
  NO_SOUL: 409,
};

export function exorcismRoutes(store: ExorcismStore | undefined, pipeline: Pipeline | undefined) {
  return async (app: FastifyInstance) => {
    const guard = (id: string) => {
      if (!Id.safeParse(id).success) return { code: 400, error: 'BAD_ID', message: 'Not an id' };
      if (!store) return { code: 503, error: 'NO_DATABASE', message: 'This API has no database' };
      return null;
    };
    app.get<{ Params: { id: string } }>('/api/projects/:id/exorcisms', async (req, reply) => {
      const bad = guard(req.params.id);
      if (bad) return reply.code(bad.code).send({ error: bad.error, message: bad.message });
      const findings = await store!.list(req.params.id);
      return { findings, remaining: findings.filter((f) => f.decision === 'pending').length };
    });
    app.post<{ Params: { id: string; code: string }; Body: unknown }>(
      '/api/projects/:id/exorcisms/:code',
      async (req, reply) => {
        const bad = guard(req.params.id);
        if (bad) return reply.code(bad.code).send({ error: bad.error, message: bad.message });
        const body = Body.safeParse(req.body);
        if (!body.success)
          return reply
            .code(400)
            .send({ error: 'BAD_DECISION', message: 'The decision is "keep" or "fix"' });
        try {
          const r = await store!.decide(req.params.id, req.params.code, body.data.decision);
          // A changed rule: prove the new Soul version (the cases it touches run again).
          const proving =
            r.changed && pipeline ? await pipeline.rerun(req.params.id, 'prove') : false;
          return { ...r, proving };
        } catch (e) {
          if (e instanceof DecisionError)
            return reply.code(STATUS[e.code]).send({ error: e.code, message: e.message });
          throw e;
        }
      },
    );
  };
}
