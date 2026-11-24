// @spec claude-api#1 Settings and the Claude API.
// @spec claude-api#1.1 The Claude API as a model provider (Prompt 80a), against a fake SDK
// client: it never calls the network.
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  AnthropicLlmClient,
  DEFAULT_ANTHROPIC_MODEL,
  fromAnthropicMessage,
  toAnthropicParams,
  type AnthropicSender,
} from './anthropic';
import { LlmRetryableError, type LlmRequest } from './types';
const REQ: LlmRequest = {
  system: 'You read old shop programs.',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Which field is GST?' }] }],
  tools: [
    {
      name: 'answer',
      description: 'The answer',
      inputSchema: { type: 'object', properties: { field: { type: 'string' } } },
    },
  ],
  toolChoice: { tool: 'answer' },
  maxTokens: 400,
  temperature: 0.2,
};
const THINKING = { type: 'thinking', thinking: 'GST is 17%...', signature: 'sig-abc' };
const REPLY = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content: [
    THINKING,
    { type: 'text', text: 'It is GST.' },
    { type: 'tool_use', id: 'tu_1', name: 'answer', input: { field: 'GST' } },
  ],
  stop_reason: 'tool_use',
  stop_details: null,
  usage: { input_tokens: 120, output_tokens: 40 },
};
function fake(answer: unknown | Error) {
  const calls: { body: Record<string, unknown>; opts: unknown }[] = [];
  const sender: AnthropicSender = {
    async create(body, opts) {
      calls.push({ body: body as unknown as Record<string, unknown>, opts });
      if (answer instanceof Error) throw answer;
      return answer as never;
    },
  };
  return { calls, sender };
}
describe('toAnthropicParams', () => {
  it('maps the request: system, messages, tools as input_schema; Sonnet 5.5 gets no forced tool or temperature', () => {
    const p = toAnthropicParams('claude-sonnet-5-5', REQ);
    expect(p).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 400,
      system: 'You read old shop programs.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Which field is GST?' }] }],
      tools: [
        {
          name: 'answer',
          description: 'The answer',
          input_schema: { type: 'object', properties: { field: { type: 'string' } } },
        },
      ],
      // A forced choice is a 400 on Sonnet 5.5: auto, and the prompt names the tool.
      tool_choice: { type: 'auto' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(p).not.toHaveProperty('temperature');
    expect(p).not.toHaveProperty('thinking');
  });
  it('an older model keeps the forced tool; no model gets a temperature (the SDK has none)', () => {
    const p = toAnthropicParams('claude-sonnet-4-5', REQ);
    expect(p.tool_choice).toEqual({ type: 'tool', name: 'answer' });
    expect(p).not.toHaveProperty('temperature');
  });
  it('sends thinking blocks back unchanged, and tool results as tool_result blocks', () => {
    const p = toAnthropicParams('claude-sonnet-5-5', {
      ...REQ,
      messages: [
        REQ.messages[0]!,
        { role: 'assistant', content: fromAnthropicMessage(REPLY as never).content },
        {
          role: 'user',
          content: [
            { type: 'tool_result', toolUseId: 'tu_1', content: { ok: true }, isError: false },
          ],
        },
      ],
    });
    expect(p.messages[1]).toEqual({ role: 'assistant', content: REPLY.content });
    expect(p.messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: '{"ok":true}', is_error: false },
      ],
    });
  });
});
describe('fromAnthropicMessage', () => {
  it('gives text and tool_use blocks, keeps thinking opaque, the stop reason and the tokens', () => {
    const r = fromAnthropicMessage(REPLY as never);
    expect(r.stopReason).toBe('tool_use');
    expect(r.usage).toEqual({ inputTokens: 120, outputTokens: 40 });
    expect(r.content).toEqual([
      { type: 'provider', provider: 'anthropic', block: THINKING },
      { type: 'text', text: 'It is GST.' },
      { type: 'tool_use', id: 'tu_1', name: 'answer', input: { field: 'GST' } },
    ]);
  });
});
describe('AnthropicLlmClient', () => {
  it('calls the beta messages API with the fallback on, and answers in our shape', async () => {
    const f = fake(REPLY);
    const c = new AnthropicLlmClient({ client: f.sender });
    expect(c.provider).toBe('anthropic');
    expect(c.model).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(DEFAULT_ANTHROPIC_MODEL).toBe('claude-sonnet-5-5');
    expect(c.capabilities).toEqual({ forcedToolChoice: false, temperature: false });
    const r = await c.converse(REQ);
    expect(r.stopReason).toBe('tool_use');
    expect(f.calls[0]!.body).toMatchObject({ fallbacks: 'default' });
  });
  it('a refusal that the fallback did not answer is an error, never empty text', async () => {
    const c = new AnthropicLlmClient({
      client: fake({ ...REPLY, content: [], stop_reason: 'refusal' }).sender,
    });
    await expect(c.converse(REQ)).rejects.toThrow('Claude declined to answer (refusal)');
  });
  it('running out of tokens with nothing said is an error too', async () => {
    const c = new AnthropicLlmClient({
      client: fake({ ...REPLY, content: [THINKING], stop_reason: 'max_tokens' }).sender,
    });
    await expect(c.converse(REQ)).rejects.toThrow('max_tokens');
  });
  it('retries the SDK’s typed errors: rate limit, connection, server; a bad request is final', async () => {
    const rate = new Anthropic.RateLimitError(429, { type: 'error' }, 'slow down', new Headers());
    const conn = new Anthropic.APIConnectionError({ message: 'reset' });
    const server = new Anthropic.InternalServerError(
      529,
      { type: 'error' },
      'overloaded',
      new Headers(),
    );
    const bad = new Anthropic.BadRequestError(400, { type: 'error' }, 'no', new Headers());
    for (const e of [rate, conn, server])
      await expect(
        new AnthropicLlmClient({ client: fake(e).sender }).converse(REQ),
      ).rejects.toBeInstanceOf(LlmRetryableError);
    const err = await new AnthropicLlmClient({ client: fake(bad).sender })
      .converse(REQ)
      .catch((x: unknown) => x);
    expect(err).not.toBeInstanceOf(LlmRetryableError);
  });
  it('passes the abort signal to the SDK', async () => {
    const f = fake(REPLY);
    const ac = new AbortController();
    await new AnthropicLlmClient({ client: f.sender }).converse(REQ, { signal: ac.signal });
    expect(f.calls[0]!.opts).toEqual({ signal: ac.signal });
  });
});
