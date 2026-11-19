// The call log in Postgres (the llm_calls table): what the "Show your work" panel lists, and what
// the token budget is counted from, so a budget holds across worker restarts and re-runs.
import { eq, llmCalls, sql, type Db } from '@afterlife/db';
import { asJson, type LlmCallLog, type LlmCallRecord } from './log';

export class PgLlmCallLog implements LlmCallLog {
  constructor(private readonly db: Db) {}

  async record(c: LlmCallRecord): Promise<void> {
    await this.db.insert(llmCalls).values({
      projectId: c.projectId,
      agent: c.agent,
      purpose: c.purpose,
      provider: c.provider,
      model: c.model,
      attempt: c.attempt,
      status: c.status,
      request: asJson(c.request),
      response: c.response ? asJson(c.response) : null,
      error: c.error,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
      durationMs: c.durationMs,
    });
  }

  async tokensUsed(projectId: string): Promise<number> {
    const [row] = await this.db
      .select({
        n: sql<string>`coalesce(sum(${llmCalls.inputTokens} + ${llmCalls.outputTokens}), 0)`,
      })
      .from(llmCalls)
      .where(eq(llmCalls.projectId, projectId));
    return Number(row?.n ?? 0);
  }
}
