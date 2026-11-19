// "Show your work" (Prompt 47): every model call the Crew made for a project, newest first, and
// the tokens it has used of its budget. The list is light; one call's request and response are
// fetched on their own when the visitor opens it.
import { llmCalls, and, desc, eq, sql, type Db } from '@afterlife/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export type LlmCallRow = {
  id: string;
  at: string;
  agent: string;
  purpose: string;
  provider: string;
  model: string;
  attempt: number;
  status: 'ok' | 'error' | 'invalid' | 'over_budget';
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  error: string | null;
};

export type LlmCallDetail = LlmCallRow & { request: unknown; response: unknown };

export interface LlmCallStore {
  /** Newest first, at most `limit`. */
  list(projectId: string, limit: number): Promise<{ calls: LlmCallRow[]; total: number }>;
  tokensUsed(projectId: string): Promise<number>;
  get(projectId: string, id: string): Promise<LlmCallDetail | null>;
}

const row = (r: typeof llmCalls.$inferSelect): LlmCallRow => ({
  id: r.id,
  at: r.createdAt.toISOString(),
  agent: r.agent,
  purpose: r.purpose,
  provider: r.provider,
  model: r.model,
  attempt: r.attempt,
  status: r.status,
  inputTokens: r.inputTokens,
  outputTokens: r.outputTokens,
  durationMs: r.durationMs,
  error: r.error,
});

export class PgLlmCallStore implements LlmCallStore {
  constructor(private readonly db: Db) {}

  async list(projectId: string, limit: number) {
    const [rows, [count]] = await Promise.all([
      this.db
        .select()
        .from(llmCalls)
        .where(eq(llmCalls.projectId, projectId))
        .orderBy(desc(llmCalls.createdAt), desc(llmCalls.id))
        .limit(limit),
      this.db
        .select({ n: sql<string>`count(*)` })
        .from(llmCalls)
        .where(eq(llmCalls.projectId, projectId)),
    ]);
    return { calls: rows.map(row), total: Number(count?.n ?? 0) };
  }

  async tokensUsed(projectId: string) {
    const [r] = await this.db
      .select({
        n: sql<string>`coalesce(sum(${llmCalls.inputTokens} + ${llmCalls.outputTokens}), 0)`,
      })
      .from(llmCalls)
      .where(eq(llmCalls.projectId, projectId));
    return Number(r?.n ?? 0);
  }

  async get(projectId: string, id: string) {
    const [r] = await this.db
      .select()
      .from(llmCalls)
      .where(and(eq(llmCalls.projectId, projectId), eq(llmCalls.id, id)));
    return r ? { ...row(r), request: r.request, response: r.response } : null;
  }
}

const Id = z.uuid();
/** The list is for reading on a page; older calls stay in the database. */
export const LLM_CALLS_PAGE = 200;

export function llmCallRoutes(
  store: LlmCallStore | undefined,
  opts: {
    projectExists: (id: string) => Promise<boolean>;
    budgetTokens: number;
    /**
     * True for a real shop's app (an upload): its calls are listed, but what was sent and answered
     * is not shown to anyone with the link (review 41-50). Graveyard samples are our own data.
     */
    isRealShop?: (id: string) => Promise<boolean>;
  },
) {
  return async (app: FastifyInstance) => {
    type Reply = { code(n: number): { send(b: unknown): unknown } };
    const project = async (id: string, reply: Reply) => {
      if (!Id.safeParse(id).success)
        return (reply.code(400).send({ error: 'BAD_ID', message: 'Not an id' }), false);
      if (!store)
        return (
          reply.code(503).send({
            error: 'NO_DATABASE',
            message: 'This API has no database, so it keeps no model calls',
          }),
          false
        );
      if (!(await opts.projectExists(id)))
        return (reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' }), false);
      return true;
    };

    app.get<{ Params: { id: string } }>('/api/projects/:id/llm-calls', async (req, reply) => {
      if (!(await project(req.params.id, reply))) return reply;
      const [{ calls, total }, tokensUsed] = await Promise.all([
        store!.list(req.params.id, LLM_CALLS_PAGE),
        store!.tokensUsed(req.params.id),
      ]);
      return {
        projectId: req.params.id,
        budget: { tokens: opts.budgetTokens, used: tokensUsed },
        bodies: (await opts.isRealShop?.(req.params.id)) ? 'hidden' : 'shown',
        total,
        calls,
      };
    });

    app.get<{ Params: { id: string; callId: string } }>(
      '/api/projects/:id/llm-calls/:callId',
      async (req, reply) => {
        if (!Id.safeParse(req.params.callId).success)
          return reply.code(400).send({ error: 'BAD_ID', message: 'Not an id' });
        if (!(await project(req.params.id, reply))) return reply;
        const call = await store!.get(req.params.id, req.params.callId);
        if (!call) return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such call' });
        return (await opts.isRealShop?.(req.params.id))
          ? { ...call, request: null, response: null, hidden: true }
          : call;
      },
    );
  };
}
