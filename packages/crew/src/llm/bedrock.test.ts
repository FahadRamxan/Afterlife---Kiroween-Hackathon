import type { ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BEDROCK_MODEL_TABLE,
  BedrockLlmClient,
  bedrockCapabilities,
  DEFAULT_BEDROCK_MODEL,
  fromBedrockOutput,
  toBedrockInput,
  toBedrockMessages,
} from './bedrock';
import { LlmRetryableError, type LlmRequest } from './types';

const REQ: LlmRequest = {
  system: 'You fill in forms in a 1998 pharmacy app.',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'A quantity?' }] },
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name: 'answer', input: { quantity: 'x' } }],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          toolUseId: 't1',
          content: 'quantity: expected number',
          isError: true,
        },
        { type: 'tool_result', toolUseId: 't2', content: { ok: true }, isError: false },
      ],
    },
  ],
  tools: [
    {
      name: 'answer',
      description: 'Give your answer.',
      inputSchema: { type: 'object', properties: { quantity: { type: 'integer' } } },
    },
  ],
  toolChoice: { tool: 'answer' },
  maxTokens: 300,
  temperature: 0.2,
};

/** A stand-in for BedrockRuntimeClient: no network. */
const sender = (reply: () => unknown) => {
  const sent: ConverseCommand[] = [];
  return {
    sent,
    send: async (cmd: ConverseCommand) => {
      sent.push(cmd);
      return reply();
    },
  };
};

// A model that takes forced tool use and a temperature, for the mapping of both.
const TAKES_ALL = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

describe('toBedrockInput', () => {
  it('maps a request to the Converse API: system, messages, tools, tool choice, limits', () => {
    expect(toBedrockInput(TAKES_ALL, REQ)).toEqual({
      modelId: TAKES_ALL,
      system: [{ text: 'You fill in forms in a 1998 pharmacy app.' }],
      inferenceConfig: { maxTokens: 300, temperature: 0.2 },
      messages: [
        { role: 'user', content: [{ text: 'A quantity?' }] },
        {
          role: 'assistant',
          content: [{ toolUse: { toolUseId: 't1', name: 'answer', input: { quantity: 'x' } } }],
        },
        {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: 't1',
                content: [{ text: 'quantity: expected number' }],
                status: 'error',
              },
            },
            {
              toolResult: { toolUseId: 't2', content: [{ json: { ok: true } }], status: 'success' },
            },
          ],
        },
      ],
      toolConfig: {
        tools: [
          {
            toolSpec: {
              name: 'answer',
              description: 'Give your answer.',
              inputSchema: {
                json: { type: 'object', properties: { quantity: { type: 'integer' } } },
              },
            },
          },
        ],
        toolChoice: { tool: { name: 'answer' } },
      },
    });
  });

  it('leaves out what was not asked for, and maps `any`', () => {
    const plain = toBedrockInput(TAKES_ALL, { messages: [], maxTokens: 10 });
    expect(plain).not.toHaveProperty('system');
    expect(plain).not.toHaveProperty('toolConfig');
    expect(plain.inferenceConfig).toEqual({ maxTokens: 10 });
    expect(toBedrockInput(TAKES_ALL, { ...REQ, toolChoice: 'any' }).toolConfig?.toolChoice).toEqual(
      {
        any: {},
      },
    );
    expect(toBedrockInput(TAKES_ALL, { ...REQ, toolChoice: 'auto' }).toolConfig).not.toHaveProperty(
      'toolChoice',
    );
  });
});

describe('fromBedrockOutput', () => {
  it('keeps text and tool calls, the stop reason and the token counts', () => {
    const out = {
      $metadata: {},
      output: {
        message: {
          role: 'assistant',
          content: [
            { text: 'Here:' },
            { toolUse: { toolUseId: 'a', name: 'answer', input: { quantity: 2 } } },
          ],
        },
      },
      stopReason: 'tool_use',
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      metrics: { latencyMs: 900 },
    } as ConverseCommandOutput;
    expect(fromBedrockOutput(out)).toEqual({
      content: [
        { type: 'text', text: 'Here:' },
        { type: 'tool_use', id: 'a', name: 'answer', input: { quantity: 2 } },
      ],
      stopReason: 'tool_use',
      usage: { inputTokens: 120, outputTokens: 30 },
    });
  });

  it('an unknown stop reason (a guardrail) is `other`', () => {
    const out = { $metadata: {}, stopReason: 'guardrail_intervened' } as ConverseCommandOutput;
    expect(fromBedrockOutput(out)).toEqual({
      content: [],
      stopReason: 'other',
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });
});

describe('BedrockLlmClient', () => {
  it('sends a ConverseCommand for Claude Sonnet by default', async () => {
    const s = sender(() => ({
      $metadata: {},
      output: { message: { role: 'assistant', content: [{ text: 'hi' }] } },
      stopReason: 'end_turn',
      usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
    }));
    const c = new BedrockLlmClient({ client: s });
    expect(c.model).toBe(DEFAULT_BEDROCK_MODEL);
    expect(c.model).toMatch(/anthropic\.claude-sonnet/);
    const r = await c.converse({ messages: [], maxTokens: 5 });
    expect(r.content).toEqual([{ type: 'text', text: 'hi' }]);
    expect(s.sent[0]!.input.modelId).toBe(DEFAULT_BEDROCK_MODEL);
  });

  it('defaults to Claude Sonnet 5.5 (Sonnet 4.5 retires): no forced tool choice or temperature', async () => {
    expect(DEFAULT_BEDROCK_MODEL).toBe('us.anthropic.claude-sonnet-5-5');
    const c = new BedrockLlmClient({ client: sender(() => ({ $metadata: {} })) });
    expect(c.capabilities).toEqual({ forcedToolChoice: false, temperature: false });
    // Even if asked for, they are not sent: Sonnet 5.5 answers 400 to both.
    const input = toBedrockInput(c.model, REQ, c.capabilities);
    expect(input.toolConfig).not.toHaveProperty('toolChoice');
    expect(input.inferenceConfig).toEqual({ maxTokens: 300 });
  });

  it('knows which models take forced tool use and temperature, family by family', () => {
    const caps = (model: string) =>
      new BedrockLlmClient({ model, client: sender(() => ({})) }).capabilities;
    const FULL = { forcedToolChoice: true, temperature: true };
    const NO_TEMPERATURE = { forcedToolChoice: true, temperature: false };
    const STRICT = { forcedToolChoice: false, temperature: false };
    const expected: [string, typeof FULL][] = [
      ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', FULL],
      ['anthropic.claude-3-5-sonnet-20240620-v1:0', FULL],
      ['anthropic.claude-haiku-4-5-20251001-v1:0', FULL],
      ['anthropic.claude-opus-4-1-20250805-v1:0', FULL],
      // Review of 51-60, finding 5: these answer 400 to a temperature.
      ['eu.anthropic.claude-sonnet-5', NO_TEMPERATURE],
      ['us.anthropic.claude-opus-4-7', NO_TEMPERATURE],
      ['us.anthropic.claude-opus-4-8-v1:0', NO_TEMPERATURE],
      ['anthropic.claude-opus-5', NO_TEMPERATURE],
      // And these to a forced tool choice as well.
      ['us.anthropic.claude-fable-5-1', STRICT],
      ['anthropic.claude-fable-5-2-v1:0', STRICT],
      ['global.anthropic.claude-sonnet-5-5', STRICT],
      ['anthropic.claude-sonnet-5-6', STRICT],
      ['us.anthropic.claude-opus-6', STRICT],
      // Unknown: a family or version not in the table, or not Claude.
      ['anthropic.claude-sonnet-5-10', STRICT],
      ['anthropic.claude-fable-6', STRICT],
      ['anthropic.claude-poem-1', STRICT],
      ['amazon.nova-pro-v1:0', STRICT],
    ];
    for (const [m, c] of expected) expect(caps(m), m).toEqual(c);
  });

  it('a model the table does not list is always strict (invariant)', () => {
    fc.assert(
      fc.property(
        fc
          .stringMatching(/^[a-z]{3,8}$/)
          .filter((f) => !BEDROCK_MODEL_TABLE.some((r) => r.family === f)),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (family, major, minor) => {
          expect(bedrockCapabilities(`anthropic.claude-${family}-${major}-${minor}`)).toEqual({
            forcedToolChoice: false,
            temperature: false,
          });
        },
      ),
    );
  });

  it('marks throttling and 5xx as retryable, and leaves other errors final', async () => {
    const fail = (name: string, status: number) => () => {
      throw Object.assign(new Error(`${name}!`), { name, $metadata: { httpStatusCode: status } });
    };
    const call = (name: string, status: number) =>
      new BedrockLlmClient({ client: sender(fail(name, status)) }).converse({
        messages: [],
        maxTokens: 1,
      });
    await expect(call('ThrottlingException', 429)).rejects.toBeInstanceOf(LlmRetryableError);
    await expect(call('ModelNotReadyException', 429)).rejects.toBeInstanceOf(LlmRetryableError);
    await expect(call('SomethingNew', 503)).rejects.toBeInstanceOf(LlmRetryableError);
    const denied = await call('AccessDeniedException', 403).catch((e: unknown) => e);
    expect(denied).not.toBeInstanceOf(LlmRetryableError);
    expect(denied).toMatchObject({ name: 'AccessDeniedException' });
    const invalid = await call('ValidationException', 400).catch((e: unknown) => e);
    expect(invalid).not.toBeInstanceOf(LlmRetryableError);
  });
});
describe('toBedrockMessages with blocks from another provider', () => {
  it('leaves out thinking blocks from the Claude API, keeping the rest in order', () => {
    const [m] = toBedrockMessages([
      {
        role: 'assistant',
        content: [
          { type: 'provider', provider: 'anthropic', block: { type: 'thinking', thinking: 'x' } },
          { type: 'text', text: 'GST' },
        ],
      },
    ]);
    expect(m!.content).toEqual([{ text: 'GST' }]);
  });
});
