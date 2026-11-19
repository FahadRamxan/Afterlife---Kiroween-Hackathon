// Where every model call is written down (Prompt 47): the "Show your work" panel reads it, and
// the per-project token budget is counted from it. The database log is pg-log.ts; this in-memory
// one is for tests and for running an agent without a database.
import type { Json, LlmRequest, LlmResponse } from './types';

/** The six product agents (crew.md). Every call says which one asked. */
export const AGENTS = [
  'possessor',
  'archaeologist',
  'surgeon',
  'undertaker',
  'oracle',
  'exorcist',
] as const;
export type AgentName = (typeof AGENTS)[number];

export type LlmCallStatus = 'ok' | 'error' | 'invalid' | 'over_budget';

export type LlmCallRecord = {
  projectId: string;
  agent: AgentName;
  purpose: string;
  provider: string;
  model: string;
  attempt: number;
  status: LlmCallStatus;
  request: LlmRequest;
  response: LlmResponse | null;
  /** Why it failed: the provider's error, the schema issues, or the budget. */
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

export interface LlmCallLog {
  record(call: LlmCallRecord): Promise<void>;
  /** Input plus output tokens of every call the project has made. */
  tokensUsed(projectId: string): Promise<number>;
}

export class MemoryLlmCallLog implements LlmCallLog {
  readonly calls: LlmCallRecord[] = [];

  async record(call: LlmCallRecord): Promise<void> {
    // Stored as JSON would be, so a test sees what the database would keep.
    this.calls.push(JSON.parse(JSON.stringify(call)) as LlmCallRecord);
  }

  async tokensUsed(projectId: string): Promise<number> {
    return this.calls
      .filter((c) => c.projectId === projectId)
      .reduce((n, c) => n + c.inputTokens + c.outputTokens, 0);
  }
}

/** A JSON-safe copy of a record's request or response (for jsonb). */
export const asJson = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;
