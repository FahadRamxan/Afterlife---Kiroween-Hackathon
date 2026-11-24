// What the Crew's agents send to a model and get back (Prompt 47). It follows the shape of the
// Bedrock Converse API, so the Bedrock client is a thin mapping, but nothing here depends on AWS:
// the fake client in tests and any other provider implement the same `LlmClient`.

/** A JSON value, as tools take and return them. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type TextBlock = { type: 'text'; text: string };
export type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Json };
export type ToolResultBlock = {
  type: 'tool_result';
  toolUseId: string;
  /** What the tool returned, or what was wrong with how it was called. */
  content: Json;
  isError: boolean;
};
/**
 * A block only its provider understands, kept as it came (Claude's thinking blocks, with their
 * signatures). The runtime sends the assistant's content back unchanged in a tool loop, so the
 * provider gets it back as it must; other providers leave it out.
 */
export type ProviderBlock = { type: 'provider'; provider: string; block: Json };
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ProviderBlock;

export type LlmMessage = { role: 'user' | 'assistant'; content: ContentBlock[] };

/** A tool the model may call. `inputSchema` is a JSON Schema object (made from a zod schema). */
export type LlmToolSpec = { name: string; description: string; inputSchema: Record<string, Json> };

export type LlmRequest = {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolSpec[];
  /** `auto`: the model decides; `any`: it must call a tool; `{tool}`: it must call that one. */
  toolChoice?: 'auto' | 'any' | { tool: string };
  maxTokens: number;
  temperature?: number;
};

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'other';

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResponse = {
  content: ContentBlock[];
  stopReason: StopReason;
  usage: LlmUsage;
};

/**
 * What the model accepts. Claude Sonnet 5.5 and later answer 400 to a forced tool choice (`any`
 * or one tool) and to any temperature (review 41-50), so for them neither is sent.
 */
export type LlmCapabilities = { forcedToolChoice: boolean; temperature: boolean };
export const FULL_CAPABILITIES: LlmCapabilities = { forcedToolChoice: true, temperature: true };

/** The request with only what the model accepts: no forced tool choice or temperature if not. */
export function fitRequest(req: LlmRequest, caps: LlmCapabilities): LlmRequest {
  const { temperature, toolChoice, ...rest } = req;
  return {
    ...rest,
    ...(temperature !== undefined && caps.temperature ? { temperature } : {}),
    ...(toolChoice !== undefined && (caps.forcedToolChoice || toolChoice === 'auto')
      ? { toolChoice }
      : {}),
  };
}

export interface LlmClient {
  /** `bedrock`, `fake`: written on every logged call so the panel says which model answered. */
  readonly provider: string;
  readonly model: string;
  readonly capabilities: LlmCapabilities;
  converse(req: LlmRequest, opts?: { signal?: AbortSignal }): Promise<LlmResponse>;
}

/**
 * A failure the provider says may pass (throttling, a busy or cold model, a dropped connection).
 * The runtime retries these; any other error is final.
 */
export class LlmRetryableError extends Error {
  override readonly name = 'LlmRetryableError';
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export const textOf = (r: { content: ContentBlock[] }): string =>
  r.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

export const toolUsesOf = (r: { content: ContentBlock[] }): ToolUseBlock[] =>
  r.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
