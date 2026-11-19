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
  LlmRetryableError,
  type ContentBlock,
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
 * Claude Sonnet 4.5 through the US cross-region inference profile. Set BEDROCK_MODEL_ID for
 * another profile (`eu.`, `apac.`, `global.`) or a newer Sonnet.
 */
export const DEFAULT_BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

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

export function toBedrockInput(model: string, req: LlmRequest): ConverseCommandInput {
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
  private readonly client: Sender;

  constructor(opts: { model?: string; region?: string; client?: Sender } = {}) {
    this.model = opts.model ?? DEFAULT_BEDROCK_MODEL;
    // Credentials come from the usual AWS chain (env, profile, role); never from code.
    this.client =
      opts.client ??
      new BedrockRuntimeClient({ region: opts.region ?? 'us-east-1', maxAttempts: 1 });
  }

  async converse(req: LlmRequest, opts: { signal?: AbortSignal } = {}): Promise<LlmResponse> {
    let out: unknown;
    try {
      out = await this.client.send(new ConverseCommand(toBedrockInput(this.model, req)), {
        ...(opts.signal ? { abortSignal: opts.signal } : {}),
      });
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
