// A scripted model for tests (unit tests never call the network). Each call takes the next step
// of the script: a response, an error to throw, or a function of the request. It keeps every
// request it was sent, so a test can check what an agent asked.
import {
  FULL_CAPABILITIES,
  type ContentBlock,
  type Json,
  type LlmCapabilities,
  type LlmClient,
  type LlmRequest,
  type LlmResponse,
  type StopReason,
} from './types';

export type FakeStep = LlmResponse | Error | ((req: LlmRequest, n: number) => LlmResponse | Error);

/** About 4 characters a token, as for English text; enough for budget tests. */
export const estimateTokens = (value: unknown): number =>
  Math.ceil(JSON.stringify(value ?? '').length / 4);

const response = (content: ContentBlock[], stopReason: StopReason): LlmResponse => ({
  content,
  stopReason,
  usage: { inputTokens: 0, outputTokens: estimateTokens(content) },
});

/** The model answers in words. */
export const fakeText = (text: string): LlmResponse =>
  response([{ type: 'text', text }], 'end_turn');

let ids = 0;
/** The model calls a tool. */
export const fakeToolUse = (name: string, input: Json, id = `tool_${++ids}`): LlmResponse =>
  response([{ type: 'tool_use', id, name, input }], 'tool_use');

export class FakeLlmClient implements LlmClient {
  readonly provider = 'fake';
  readonly requests: LlmRequest[] = [];
  private readonly steps: FakeStep[];
  private readonly fn?: (req: LlmRequest, n: number) => LlmResponse | Error;

  constructor(
    script: FakeStep[] | ((req: LlmRequest, n: number) => LlmResponse | Error),
    readonly model = 'fake-model',
    /** What the scripted model accepts: everything, unless a test plays a stricter model. */
    readonly capabilities: LlmCapabilities = FULL_CAPABILITIES,
  ) {
    this.steps = Array.isArray(script) ? [...script] : [];
    if (!Array.isArray(script)) this.fn = script;
  }

  async converse(req: LlmRequest, opts: { signal?: AbortSignal } = {}): Promise<LlmResponse> {
    opts.signal?.throwIfAborted();
    // A stricter model refuses what it does not take, as Sonnet 5.5 answers 400.
    if (!this.capabilities.forcedToolChoice && req.toolChoice && req.toolChoice !== 'auto')
      throw new Error('ValidationException: forced tool choice is not supported by this model');
    if (!this.capabilities.temperature && req.temperature !== undefined)
      throw new Error('ValidationException: temperature is not supported by this model');
    // A copy: the caller goes on adding messages to its own array.
    this.requests.push(structuredClone(req));
    const n = this.requests.length;
    const step = this.fn ?? this.steps.shift();
    if (step === undefined) throw new Error(`FakeLlmClient: the script has no step for call ${n}`);
    const out = typeof step === 'function' ? step(req, n) : step;
    if (out instanceof Error) throw out;
    return {
      ...out,
      usage: { inputTokens: estimateTokens(req), outputTokens: out.usage.outputTokens },
    };
  }

  /** Calls the script has not used yet. */
  get remaining(): number {
    return this.steps.length;
  }
}
