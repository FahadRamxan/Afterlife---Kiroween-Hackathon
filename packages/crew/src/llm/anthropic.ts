// The Claude API as a model provider (Prompt 80a), next to Bedrock: the same Claude models, for a
// team with an Anthropic API key instead of AWS. Like bedrock.ts this only maps our request and
// reply to the SDK's; retries, the token budget and logging are the runtime's (runtime.ts), so the
// SDK's own retries are off (one attempt = one logged call).
// Sonnet 5.5's rules: no forced tool choice and no temperature (both are a 400), never
// `thinking: {type: "disabled"}`; thinking is on, so its blocks go back unchanged in a tool loop.
import Anthropic from '@anthropic-ai/sdk';
import { bedrockCapabilities } from './bedrock';
import {
  LlmRetryableError,
  fitRequest,
  type ContentBlock,
  type Json,
  type LlmCapabilities,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type StopReason,
} from './types';
type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Message = Anthropic.Beta.Messages.BetaMessage;
/** The same model as the Bedrock default, by its Claude API name. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
/** Server-side fallback: a model that declines for policy reasons hands over to another. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** How hard Claude thinks before it answers (`output_config.effort`). */
export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const ANTHROPIC_EFFORTS: readonly AnthropicEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
/**
 * Our calls are short extraction and classification, sized at 300 to 1,200 tokens for the answer.
 * Sonnet 5.5 thinks before almost every reply from `medium` up (its default is `high`), and the
 * thinking counts toward `max_tokens`, so a short call could end before its answer starts. At
 * `low` it skips thinking on most simple requests (review of Prompt 81). ANTHROPIC_EFFORT changes it.
 */
export const DEFAULT_ANTHROPIC_EFFORT: AnthropicEffort = 'low';
/** Tokens for thinking on top of what the caller asked for its answer, by effort. */
export const THINKING_ROOM: Record<AnthropicEffort | 'default', number> = {
  low: 2_048,
  medium: 4_096,
  high: 8_192,
  xhigh: 16_384,
  max: 16_384,
  // No effort sent: the model's own default (`high` on Sonnet 5.5).
  default: 8_192,
};
/**
 * Models that take `output_config.effort`: Sonnet and Opus 4.6 and later, Haiku 5.5 and later,
 * every Fable and Mythos. Others (Haiku 4.5) answer 400 to it, so they get none by default.
 */
export function takesEffort(model: string): boolean {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?=[-:.@]|$)/.exec(model);
  if (!m) return false;
  const [major, minor] = [Number(m[2]), Number(m[3] ?? 0)];
  const from = (a: number, b: number) => major > a || (major === a && minor >= b);
  switch (m[1]) {
    case 'fable':
    case 'mythos':
      return true;
    case 'sonnet':
    case 'opus':
      return from(4, 6);
    case 'haiku':
      return from(5, 5);
    default:
      return false;
  }
}
const defaultEffort = (model: string): AnthropicEffort | null =>
  takesEffort(model) ? DEFAULT_ANTHROPIC_EFFORT : null;
/** The part of the SDK client this uses (a fake in tests). */
export type AnthropicSender = {
  create(body: Params, opts?: { signal?: AbortSignal }): Promise<Message>;
};
const PROVIDER = 'anthropic';
function toAnthropicContent(blocks: ContentBlock[]): Json[] {
  const out: Json[] = [];
  for (const b of blocks)
    switch (b.type) {
      case 'text':
        out.push({ type: 'text', text: b.text });
        break;
      case 'tool_use':
        out.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input });
        break;
      case 'tool_result':
        out.push({
          type: 'tool_result',
          tool_use_id: b.toolUseId,
          content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
          is_error: b.isError,
        });
        break;
      case 'provider':
        // Thinking blocks, exactly as Claude sent them; another provider's blocks are not ours.
        if (b.provider === PROVIDER) out.push(b.block);
        break;
    }
  return out;
}
export function toAnthropicParams(
  model: string,
  request: LlmRequest,
  capabilities: LlmCapabilities = { ...bedrockCapabilities(model), temperature: false },
  /** null: none sent, so the model's own default applies. */
  effort: AnthropicEffort | null = defaultEffort(model),
): Params {
  const req = fitRequest(request, capabilities);
  const choice =
    req.toolChoice === undefined || req.toolChoice === 'auto'
      ? { type: 'auto' as const }
      : req.toolChoice === 'any'
        ? { type: 'any' as const }
        : { type: 'tool' as const, name: req.toolChoice.tool };
  return {
    model,
    // Thinking counts toward max_tokens: room for it on top of the answer the caller sized. Only
    // the tokens used are billed, and the runtime counts them against the project's budget.
    max_tokens: req.maxTokens + THINKING_ROOM[effort ?? 'default'],
    ...(effort ? { output_config: { effort } } : {}),
    ...(req.system ? { system: req.system } : {}),
    messages: req.messages.map((m) => ({
      role: m.role,
      content: toAnthropicContent(m.content),
    })) as unknown as Params['messages'],
    ...(req.tools?.length
      ? {
          tools: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Beta.Messages.BetaTool['input_schema'],
          })),
          tool_choice: choice,
        }
      : {}),
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
  };
}
const STOP: Record<string, StopReason> = {
  end_turn: 'end_turn',
  tool_use: 'tool_use',
  max_tokens: 'max_tokens',
  stop_sequence: 'stop_sequence',
};
export function fromAnthropicMessage(m: Message): LlmResponse {
  const content: ContentBlock[] = [];
  for (const b of m.content) {
    if (b.type === 'text') content.push({ type: 'text', text: b.text });
    else if (b.type === 'tool_use')
      content.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input as Json });
    else if (b.type === 'thinking' || b.type === 'redacted_thinking')
      content.push({ type: 'provider', provider: PROVIDER, block: b as unknown as Json });
    // Server tool results and other blocks are not asked for, so they are not kept.
  }
  return {
    content,
    stopReason: STOP[m.stop_reason ?? ''] ?? 'other',
    usage: { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens },
  };
}
export class AnthropicLlmClient implements LlmClient {
  readonly provider = PROVIDER;
  readonly model: string;
  readonly capabilities: LlmCapabilities;
  /** The effort sent with every call; null: none (the model's default). */
  readonly effort: AnthropicEffort | null;
  private readonly client: AnthropicSender;
  constructor(
    opts: {
      model?: string;
      apiKey?: string;
      client?: AnthropicSender;
      /** Left out: `low` for a model that takes it; null: none. */
      effort?: AnthropicEffort | null;
    } = {},
  ) {
    this.model = opts.model ?? DEFAULT_ANTHROPIC_MODEL;
    // The SDK takes no temperature at all; the tool choice follows the model family.
    this.capabilities = { ...bedrockCapabilities(this.model), temperature: false };
    this.effort = opts.effort === undefined ? defaultEffort(this.model) : opts.effort;
    if (opts.client) this.client = opts.client;
    else {
      // The key is read from ANTHROPIC_API_KEY by the SDK (or given); never kept on this object.
      const sdk = new Anthropic({ ...(opts.apiKey ? { apiKey: opts.apiKey } : {}), maxRetries: 0 });
      this.client = { create: (body, o) => sdk.beta.messages.create(body, o) };
    }
  }
  async converse(req: LlmRequest, opts: { signal?: AbortSignal } = {}): Promise<LlmResponse> {
    let m: Message;
    try {
      m = await this.client.create(
        toAnthropicParams(this.model, req, this.capabilities, this.effort),
        opts.signal ? { signal: opts.signal } : undefined,
      );
    } catch (e) {
      if (
        e instanceof Anthropic.RateLimitError ||
        e instanceof Anthropic.APIConnectionError ||
        e instanceof Anthropic.InternalServerError
      )
        throw new LlmRetryableError(`Claude API: ${(e as Error).name}: ${(e as Error).message}`, e);
      throw e;
    }
    const r = fromAnthropicMessage(m);
    // A refusal the fallback did not answer, or a reply cut off with nothing in it, is an error:
    // empty text would read as "the model found nothing".
    const said = r.content.some((b) => b.type === 'text' || b.type === 'tool_use');
    if (m.stop_reason === 'refusal')
      throw new Error(`Claude declined to answer (refusal)${said ? '' : ', and said nothing'}`);
    if (m.stop_reason === 'max_tokens' && !said)
      throw new Error('Claude ran out of tokens (max_tokens) before answering');
    return r;
  }
}
