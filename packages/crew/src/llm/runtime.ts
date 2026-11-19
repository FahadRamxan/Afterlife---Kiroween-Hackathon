// The Crew's way to use a model (Prompt 47). Agents never call an `LlmClient` directly: they
// go through `CrewLlm`, which
// - retries what the provider says may pass, with exponential backoff,
// - refuses a call once the project has used its token budget,
// - writes every attempt (request, response, tokens, time) to the call log for "Show your work",
// - and checks every answer against a zod schema (crew.md: the LLM proposes, code decides).
import { z } from 'zod';
import type { AgentName, LlmCallLog, LlmCallStatus } from './log';
import {
  LlmRetryableError,
  textOf,
  toolUsesOf,
  type ContentBlock,
  type Json,
  type LlmClient,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type LlmToolSpec,
} from './types';

export class LlmBudgetError extends Error {
  override readonly name = 'LlmBudgetError';
  constructor(
    readonly used: number,
    readonly limit: number,
  ) {
    super(`The project has used ${used} of its ${limit} model tokens`);
  }
}

/** The model's answer never fitted its schema, however often it was asked again. */
export class LlmSchemaError extends Error {
  override readonly name = 'LlmSchemaError';
  constructor(readonly issues: string[]) {
    super(`The model's answer did not fit its schema: ${issues.join('; ')}`);
  }
}

/** The model kept calling tools past the turn limit. */
export class LlmToolLoopError extends Error {
  override readonly name = 'LlmToolLoopError';
  constructor(readonly turns: number) {
    super(`The model was still calling tools after ${turns} turns`);
  }
}

export type RetryPolicy = { attempts: number; baseDelayMs: number; maxDelayMs: number };
export const DEFAULT_RETRY: RetryPolicy = { attempts: 4, baseDelayMs: 500, maxDelayMs: 8000 };

/** The wait before retry `n` (1 for the first retry): base, 2 base, 4 base, ..., up to max. */
export const backoffMs = (p: RetryPolicy, n: number): number =>
  Math.min(p.maxDelayMs, p.baseDelayMs * 2 ** (n - 1));

export type CallTag = { agent: AgentName; purpose: string };

/** A tool an agent offers the model. Its input is checked with `input` before `run` sees it. */
export type CrewTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  input: S;
  run: (input: z.infer<S>) => Promise<Json> | Json;
};

/** A tool with its input type checked against its schema, for a list of mixed tools. */
export const crewTool = <S extends z.ZodType>(tool: CrewTool<S>): CrewTool =>
  tool as unknown as CrewTool;

export type ToolCall = { name: string; input: Json; output: Json; isError: boolean };
export type ToolRun = { text: string; turns: number; toolCalls: ToolCall[] };

export type CrewLlmOptions = {
  client: LlmClient;
  log: LlmCallLog;
  projectId: string;
  /** Input plus output tokens the project may use in all. */
  budgetTokens: number;
  retry?: Partial<RetryPolicy>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: AbortSignal;
};

const issuesOf = (e: z.ZodError): string[] =>
  e.issues.slice(0, 10).map((i) => `${i.path.join('.') || '(answer)'}: ${i.message}`);

/** A JSON Schema object for a tool's input, from its zod schema. */
export function toolInputSchema(schema: z.ZodType): Record<string, Json> {
  const json = { ...(z.toJSONSchema(schema, { io: 'input' }) as Record<string, Json>) };
  delete json.$schema;
  if (json.type !== 'object')
    throw new Error('A tool input or a JSON answer must be a zod object schema');
  return json;
}

const ANSWER = 'answer';

export class CrewLlm {
  private readonly retry: RetryPolicy;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly opts: CrewLlmOptions) {
    this.retry = { ...DEFAULT_RETRY, ...opts.retry };
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => performance.now());
  }

  get provider(): string {
    return this.opts.client.provider;
  }

  get model(): string {
    return this.opts.client.model;
  }

  /** Tokens the project has left. */
  async remaining(): Promise<number> {
    return this.opts.budgetTokens - (await this.opts.log.tokensUsed(this.opts.projectId));
  }

  /** One request, retried while the provider says it may pass. Every attempt is logged. */
  async converse(req: LlmRequest, tag: CallTag): Promise<LlmResponse> {
    return (await this.call(req, tag, 1)).response;
  }

  /**
   * An answer of the schema's shape. The model is made to call an `answer` tool whose input is
   * the schema; an answer that does not fit is logged `invalid`, and the model is shown what was
   * wrong and asked again, up to `repairs` times.
   */
  async json<S extends z.ZodType>(
    schema: S,
    req: Omit<LlmRequest, 'tools' | 'toolChoice'> & { describe?: string },
    tag: CallTag & { repairs?: number },
  ): Promise<z.infer<S>> {
    const { describe, ...base } = req;
    const tool: LlmToolSpec = {
      name: ANSWER,
      description: describe ?? 'Give your answer.',
      inputSchema: toolInputSchema(schema),
    };
    const messages: LlmMessage[] = [...base.messages];
    const repairs = tag.repairs ?? 2;
    let attempt = 1;
    let issues: string[] = [];
    for (let round = 0; round <= repairs; round++) {
      const got: { value?: z.infer<S> } = {};
      const r = await this.call(
        { ...base, messages, tools: [tool], toolChoice: { tool: ANSWER } },
        tag,
        attempt,
        (res) => {
          const use = toolUsesOf(res).find((u) => u.name === ANSWER);
          if (!use) return [`no call to the ${ANSWER} tool`];
          const parsed = schema.safeParse(use.input);
          if (parsed.success) {
            got.value = parsed.data;
            return null;
          }
          return issuesOf(parsed.error);
        },
      );
      if ('value' in got) return got.value as z.infer<S>;
      issues = r.issues ?? [];
      attempt = r.nextAttempt;
      messages.push({ role: 'assistant', content: r.response.content });
      const use = toolUsesOf(r.response).find((u) => u.name === ANSWER);
      messages.push({
        role: 'user',
        content: [
          use
            ? {
                type: 'tool_result',
                toolUseId: use.id,
                isError: true,
                content: `That answer does not fit the schema: ${issues.join('; ')}. Call ${ANSWER} again with a corrected answer.`,
              }
            : { type: 'text', text: `Answer by calling the ${ANSWER} tool.` },
        ],
      });
    }
    throw new LlmSchemaError(issues);
  }

  /**
   * Lets the model call tools until it answers in words. Each tool's input is checked with its
   * zod schema first: a bad input, an unknown tool or a tool that throws goes back to the model
   * as an error result, so it can correct itself. Every turn is a logged call.
   */
  async useTools(
    req: Omit<LlmRequest, 'tools'>,
    tools: CrewTool[],
    tag: CallTag & { maxTurns?: number },
  ): Promise<ToolRun> {
    const byName = new Map(tools.map((t) => [t.name, t]));
    const specs: LlmToolSpec[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: toolInputSchema(t.input),
    }));
    const messages: LlmMessage[] = [...req.messages];
    const toolCalls: ToolCall[] = [];
    const maxTurns = tag.maxTurns ?? 8;
    let attempt = 1;
    for (let turn = 1; turn <= maxTurns; turn++) {
      const r = await this.call({ ...req, messages, tools: specs }, tag, attempt);
      attempt = r.nextAttempt;
      const uses = toolUsesOf(r.response);
      if (uses.length === 0) return { text: textOf(r.response), turns: turn, toolCalls };
      messages.push({ role: 'assistant', content: r.response.content });
      const results: ContentBlock[] = [];
      for (const use of uses) {
        const tool = byName.get(use.name);
        let output: Json;
        let isError = true;
        if (!tool) output = `There is no tool named ${use.name}`;
        else {
          const parsed = tool.input.safeParse(use.input);
          if (!parsed.success) output = `Bad input: ${issuesOf(parsed.error).join('; ')}`;
          else {
            try {
              output = await tool.run(parsed.data);
              isError = false;
            } catch (e) {
              output = `The tool failed: ${(e as Error).message}`;
            }
          }
        }
        toolCalls.push({ name: use.name, input: use.input, output, isError });
        results.push({ type: 'tool_result', toolUseId: use.id, content: output, isError });
      }
      messages.push({ role: 'user', content: results });
    }
    throw new LlmToolLoopError(maxTurns);
  }

  /**
   * Sends one request, retrying retryable failures. `validate` sees a successful response; the
   * issues it returns make that attempt's log row `invalid`.
   */
  private async call(
    req: LlmRequest,
    tag: CallTag,
    firstAttempt: number,
    validate?: (r: LlmResponse) => string[] | null,
  ): Promise<{ response: LlmResponse; issues: string[] | null; nextAttempt: number }> {
    const { client, log, projectId, budgetTokens, signal } = this.opts;
    const row = (
      attempt: number,
      status: LlmCallStatus,
      rest: Partial<Parameters<LlmCallLog['record']>[0]>,
    ) =>
      log.record({
        projectId,
        agent: tag.agent,
        purpose: tag.purpose,
        provider: client.provider,
        model: client.model,
        attempt,
        status,
        request: req,
        response: null,
        error: null,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        ...rest,
      });
    for (let n = 1; ; n++) {
      const attempt = firstAttempt + n - 1;
      signal?.throwIfAborted();
      const used = await log.tokensUsed(projectId);
      if (used >= budgetTokens) {
        const err = new LlmBudgetError(used, budgetTokens);
        await row(attempt, 'over_budget', { error: err.message });
        throw err;
      }
      // Never ask for more output than the budget has left.
      const sent = { ...req, maxTokens: Math.min(req.maxTokens, budgetTokens - used) };
      const start = this.now();
      const elapsed = () => Math.max(0, Math.round(this.now() - start));
      let response: LlmResponse;
      try {
        response = await client.converse(sent, signal ? { signal } : {});
      } catch (e) {
        await row(attempt, 'error', {
          request: sent,
          error: (e as Error).message,
          durationMs: elapsed(),
        });
        if (!(e instanceof LlmRetryableError) || n >= this.retry.attempts) throw e;
        await this.sleep(backoffMs(this.retry, n));
        continue;
      }
      const durationMs = elapsed();
      const issues = validate ? validate(response) : null;
      await row(attempt, issues ? 'invalid' : 'ok', {
        request: sent,
        response,
        error: issues ? issues.join('; ') : null,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        durationMs,
      });
      return { response, issues, nextAttempt: attempt + 1 };
    }
  }
}
