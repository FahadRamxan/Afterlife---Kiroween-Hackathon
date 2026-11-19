// The real model: Claude Sonnet on Amazon Bedrock through the Converse API (tech.md). This file
// only maps our request and response shapes to Bedrock's; retries, the token budget and logging
// are the runtime's (runtime.ts), so the SDK's own retries are off (one attempt = one log row).
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock as BedrockBlock,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Message as BedrockMessage,
  type ToolChoice,
  type ToolUseBlock as BedrockToolUse,
} from '@aws-sdk/client-bedrock-runtime';
import {
  FULL_CAPABILITIES,
  LlmRetryableError,
  fitRequest,
  type ContentBlock,
  type LlmCapabilities,
  type Json,
  type LlmClient,
  type LlmMessage,
  type LlmRequest,
  type LlmResponse,
  type StopReason,
} from './types';

/** Bedrock's JSON document type (from @smithy/types, through the SDK's own types). */
type DocumentType = NonNullable<BedrockToolUse['input']>;

/**
 * Claude Sonnet 5.5 through the US geo inference profile (Bedrock serves it only through
 * inference profiles; Sonnet 4.5 retires). Set BEDROCK_MODEL_ID for another profile
 * (`global.anthropic.claude-sonnet-5-5`, `eu.`, `au.`) or another model.
 */
export const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-sonnet-5-5';

/** The errors Bedrock documents as worth trying again. */
const RETRYABLE = new Set([
  'ThrottlingException',
  'ServiceUnavailableException',
  'ModelNotReadyException',
  'InternalServerException',
  'ModelTimeoutException',
]);

type Sender = {
  send(cmd: ConverseCommand, opts?: { abortSignal?: AbortSignal }): Promise<unknown>;
};

export function toBedrockMessages(messages: LlmMessage[]): BedrockMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((b): BedrockBlock => {
      switch (b.type) {
        case 'text':
          return { text: b.text };
        case 'tool_use':
          return {
            toolUse: { toolUseId: b.id, name: b.name, input: b.input as DocumentType },
          };
        case 'tool_result':
          return {
            toolResult: {
              toolUseId: b.toolUseId,
              // Bedrock takes a JSON object or text; anything else goes as text.
              content: [
                b.content !== null && typeof b.content === 'object' && !Array.isArray(b.content)
                  ? { json: b.content as DocumentType }
                  : { text: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) },
              ],
              status: b.isError ? 'error' : 'success',
            },
          };
      }
    }),
  }));
}

/**
 * What a Claude model on Bedrock accepts. Sonnet 5.5, and the Claude models after it, answer 400
 * to a forced tool choice and to any temperature (Anthropic's Sonnet 5.5 migration guide); Sonnet
 * 4.5 and Sonnet 5 take both.
 */
export function bedrockCapabilities(model: string): LlmCapabilities {
  const m = /claude-[a-z]+-(\d+)(?:-(\d{1,2}))?(?=[-:.]|$)/.exec(model);
  if (!m) return FULL_CAPABILITIES;
  const major = Number(m[1]);
  // "4-5-20250929": the minor is 5; a date after it is not a version.
  const minor = m[2] ? Number(m[2]) : 0;
  const strict = major > 5 || (major === 5 && minor >= 5);
  return strict ? { forcedToolChoice: false, temperature: false } : FULL_CAPABILITIES;
}

export function toBedrockInput(
  model: string,
  request: LlmRequest,
  capabilities: LlmCapabilities = bedrockCapabilities(model),
): ConverseCommandInput {
  const req = fitRequest(request, capabilities);
  const choice: ToolChoice | undefined =
    req.toolChoice === undefined || req.toolChoice === 'auto'
      ? undefined
      : req.toolChoice === 'any'
        ? { any: {} }
        : { tool: { name: req.toolChoice.tool } };
  return {
    modelId: model,
    messages: toBedrockMessages(req.messages),
    ...(req.system ? { system: [{ text: req.system }] } : {}),
    inferenceConfig: {
      maxTokens: req.maxTokens,
      ...(req.temperature === undefined ? {} : { temperature: req.temperature }),
    },
    ...(req.tools?.length
      ? {
          toolConfig: {
            tools: req.tools.map((t) => ({
              toolSpec: {
                name: t.name,
                description: t.description,
                inputSchema: { json: t.inputSchema as DocumentType },
              },
            })),
            ...(choice ? { toolChoice: choice } : {}),
          },
        }
      : {}),
  };
}

const STOP: Record<string, StopReason> = {
  end_turn: 'end_turn',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
  stop_sequence: 'stop_sequence',
};

export function fromBedrockOutput(out: ConverseCommandOutput): LlmResponse {
  const blocks = out.output && 'message' in out.output ? (out.output.message?.content ?? []) : [];
  const content: ContentBlock[] = [];
  for (const b of blocks) {
    if (b.text !== undefined) content.push({ type: 'text', text: b.text });
    else if (b.toolUse)
      content.push({
        type: 'tool_use',
        id: b.toolUse.toolUseId ?? '',
        name: b.toolUse.name ?? '',
        input: (b.toolUse.input ?? null) as Json,
      });
    // Reasoning, images and guard-rail blocks are not asked for, so they are not kept.
  }
  return {
    content,
    stopReason: STOP[out.stopReason ?? ''] ?? 'other',
    usage: {
      inputTokens: out.usage?.inputTokens ?? 0,
      outputTokens: out.usage?.outputTokens ?? 0,
    },
  };
}

export class BedrockLlmClient implements LlmClient {
  readonly provider = 'bedrock';
  readonly model: string;
  readonly capabilities: LlmCapabilities;
  private readonly client: Sender;

  constructor(opts: { model?: string; region?: string; client?: Sender } = {}) {
    this.model = opts.model ?? DEFAULT_BEDROCK_MODEL;
    this.capabilities = bedrockCapabilities(this.model);
    // Credentials come from the usual AWS chain (env, profile, role); never from code.
    this.client =
      opts.client ??
      new BedrockRuntimeClient({ region: opts.region ?? 'us-east-1', maxAttempts: 1 });
  }

  async converse(req: LlmRequest, opts: { signal?: AbortSignal } = {}): Promise<LlmResponse> {
    let out: unknown;
    try {
      out = await this.client.send(
        new ConverseCommand(toBedrockInput(this.model, req, this.capabilities)),
        {
          ...(opts.signal ? { abortSignal: opts.signal } : {}),
        },
      );
    } catch (e) {
      const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const status = err.$metadata?.httpStatusCode ?? 0;
      if (RETRYABLE.has(err.name ?? '') || status >= 500 || err.name === 'TimeoutError')
        throw new LlmRetryableError(`Bedrock: ${err.name}: ${err.message}`, e);
      throw e;
    }
    return fromBedrockOutput(out as ConverseCommandOutput);
  }
}
