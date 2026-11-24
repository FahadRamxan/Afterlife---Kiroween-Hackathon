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
  type ProviderBlock,
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

const notProvider = (b: ContentBlock): b is Exclude<ContentBlock, ProviderBlock> =>
  b.type !== 'provider';
export function toBedrockMessages(messages: LlmMessage[]): BedrockMessage[] {
  return messages.map((m) => ({
    role: m.role,
    // Another provider's blocks (Claude API thinking) mean nothing to Bedrock: left out.
    content: m.content.filter(notProvider).map((b): BedrockBlock => {
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

const STRICT: LlmCapabilities = { forcedToolChoice: false, temperature: false };
const NO_TEMPERATURE: LlmCapabilities = { forcedToolChoice: true, temperature: false };

/**
 * What each Claude family on Bedrock accepts, by version (review of 51-60, finding 5). A row
 * covers versions from `from` up to, not including, `to`. Sonnet 5.5 and the models after it
 * answer 400 to a forced tool choice and to any temperature; Fable 5.1 and 5.2 to both as well;
 * Sonnet 5, Opus 4.7 to 5 to a temperature only. Older models take both.
 */
export const BEDROCK_MODEL_TABLE: {
  family: string;
  from: string;
  to: string;
  capabilities: LlmCapabilities;
}[] = [
  { family: 'sonnet', from: '0', to: '5', capabilities: FULL_CAPABILITIES },
  { family: 'sonnet', from: '5', to: '5.5', capabilities: NO_TEMPERATURE },
  { family: 'opus', from: '0', to: '4.7', capabilities: FULL_CAPABILITIES },
  { family: 'opus', from: '4.7', to: '5.5', capabilities: NO_TEMPERATURE },
  { family: 'haiku', from: '0', to: '5', capabilities: FULL_CAPABILITIES },
  { family: 'fable', from: '5.1', to: '5.3', capabilities: STRICT },
];

/** Compares a version with one written "4.7": major first, then minor (5.10 is after 5.9). */
const compare = ([major, minor]: [number, number], v: string) => {
  const [a, b = '0'] = v.split('.');
  return major - Number(a) || minor - Number(b);
};

/**
 * What a model on Bedrock accepts, from {@link BEDROCK_MODEL_TABLE}. A model the table does not
 * know (a newer version, another family, not Claude) is treated as strict: auto tool choice and no
 * temperature, which every model takes (the runtime's repair loop handles a missing tool call).
 */
export function bedrockCapabilities(model: string): LlmCapabilities {
  // "claude-sonnet-4-5-20250929" (family first), or "claude-3-5-sonnet-20240620" (Claude 3).
  // In both, "4-5-20250929": the minor is 5; a date after it is not a version.
  const named = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?=[-:.@]|$)/.exec(model);
  const old = /claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?=[-:.@]|$)/.exec(model);
  if (!named && !old) return STRICT;
  const family = named ? named[1]! : old![3]!;
  const [major, minor] = named ? [named[2], named[3]] : [old![1], old![2]];
  const version: [number, number] = [Number(major), minor ? Number(minor) : 0];
  const row = BEDROCK_MODEL_TABLE.find(
    (r) => r.family === family && compare(version, r.from) >= 0 && compare(version, r.to) < 0,
  );
  return row ? row.capabilities : STRICT;
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
