import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { FakeLlmClient, fakeText, fakeToolUse } from './fake';
import { MemoryLlmCallLog } from './log';
import {
  CrewLlm,
  LlmBudgetError,
  LlmSchemaError,
  LlmToolLoopError,
  toolInputSchema,
  crewTool,
} from './runtime';
import { LlmRetryableError, type LlmRequest, type ToolResultBlock } from './types';

const PROJECT = '0190a6d2-0000-7000-8000-000000000001';
const TAG = { agent: 'possessor', purpose: 'pick a quantity' } as const;
const ask = (text: string): LlmRequest => ({
  messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  maxTokens: 500,
});

function setup(script: ConstructorParameters<typeof FakeLlmClient>[0], budgetTokens = 100_000) {
  const client = new FakeLlmClient(script);
  const log = new MemoryLlmCallLog();
  const sleep = vi.fn((ms: number) => Promise.resolve(void ms));
  const llm = new CrewLlm({ client, log, projectId: PROJECT, budgetTokens, sleep });
  return { client, log, sleep, llm };
}

describe('CrewLlm.converse', () => {
  it('logs the request, the response, the tokens and who asked', async () => {
    const { llm, log } = setup([fakeText('12')]);
    const r = await llm.converse(ask('A quantity?'), TAG);
    expect(r.content).toEqual([{ type: 'text', text: '12' }]);
    expect(log.calls).toHaveLength(1);
    const c = log.calls[0]!;
    expect(c).toMatchObject({
      projectId: PROJECT,
      agent: 'possessor',
      purpose: 'pick a quantity',
      provider: 'fake',
      model: 'fake-model',
      attempt: 1,
      status: 'ok',
      error: null,
    });
    expect(c.request.messages[0]!.content).toEqual([{ type: 'text', text: 'A quantity?' }]);
    expect(c.response?.content).toEqual(r.content);
    expect(c.inputTokens).toBeGreaterThan(0);
    expect(c.outputTokens).toBeGreaterThan(0);
  });

  it('retries a retryable failure with exponential backoff, logging every attempt', async () => {
    const busy = () => new LlmRetryableError('ThrottlingException: slow down');
    const { llm, log, sleep } = setup([busy(), busy(), fakeText('ok')]);
    await expect(llm.converse(ask('hi'), TAG)).resolves.toMatchObject({ stopReason: 'end_turn' });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
    expect(log.calls.map((c) => [c.attempt, c.status])).toEqual([
      [1, 'error'],
      [2, 'error'],
      [3, 'ok'],
    ]);
    expect(log.calls[0]!.error).toMatch(/ThrottlingException/);
  });

  it('gives up after the last attempt, and never retries a final error', async () => {
    const busy = () => new LlmRetryableError('busy');
    const a = setup([busy(), busy(), busy(), busy(), fakeText('too late')]);
    await expect(a.llm.converse(ask('hi'), TAG)).rejects.toBeInstanceOf(LlmRetryableError);
    expect(a.log.calls).toHaveLength(4);
    expect(a.client.remaining).toBe(1);

    const b = setup([new Error('AccessDeniedException: no model access'), fakeText('x')]);
    await expect(b.llm.converse(ask('hi'), TAG)).rejects.toThrow(/AccessDenied/);
    expect(b.log.calls.map((c) => c.status)).toEqual(['error']);
    expect(b.sleep).not.toHaveBeenCalled();
  });

  it('refuses a call once the project has used its budget, and says so in the log', async () => {
    const { llm, log, client } = setup([fakeText('a'), fakeText('b')], 20);
    await llm.converse(ask('first'), TAG);
    const used = log.calls[0]!.inputTokens + log.calls[0]!.outputTokens;
    expect(used).toBeGreaterThanOrEqual(20);
    const err = await llm.converse(ask('second'), TAG).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmBudgetError);
    expect(err).toMatchObject({ used, limit: 20 });
    expect(log.calls.at(-1)).toMatchObject({ status: 'over_budget', inputTokens: 0 });
    expect(client.requests).toHaveLength(1);
    await expect(llm.remaining()).resolves.toBe(20 - used);
  });

  it('never asks for more output tokens than the budget has left', async () => {
    const { llm, client } = setup([fakeText('a')], 120);
    await llm.converse({ ...ask('q'), maxTokens: 4000 }, TAG);
    expect(client.requests[0]!.maxTokens).toBe(120);
  });

  it('the budget is per project', async () => {
    const client = new FakeLlmClient([fakeText('a'), fakeText('b')]);
    const log = new MemoryLlmCallLog();
    const one = new CrewLlm({ client, log, projectId: PROJECT, budgetTokens: 30 });
    const other = new CrewLlm({
      client,
      log,
      projectId: `${PROJECT.slice(0, -1)}2`,
      budgetTokens: 30,
    });
    await one.converse(ask('long enough to use the budget up'), TAG);
    await expect(one.converse(ask('x'), TAG)).rejects.toBeInstanceOf(LlmBudgetError);
    await expect(other.converse(ask('x'), TAG)).resolves.toBeDefined();
  });

  it('stops at once when the step is aborted', async () => {
    const ctl = new AbortController();
    ctl.abort(new Error('timed out'));
    const client = new FakeLlmClient([fakeText('a')]);
    const llm = new CrewLlm({
      client,
      log: new MemoryLlmCallLog(),
      projectId: PROJECT,
      budgetTokens: 1000,
      signal: ctl.signal,
    });
    await expect(llm.converse(ask('x'), TAG)).rejects.toThrow('timed out');
    expect(client.requests).toHaveLength(0);
  });
});

const Medicine = z.object({
  name: z.string().min(1).max(20),
  quantity: z.number().int().min(1),
});

describe('CrewLlm.json', () => {
  it('makes the model call an answer tool shaped like the schema, and returns the parsed value', async () => {
    const { llm, client } = setup([fakeToolUse('answer', { name: 'PANADOL', quantity: 2 })]);
    const v = await llm.json(
      Medicine,
      { ...ask('A medicine and a quantity'), describe: 'A sale' },
      TAG,
    );
    expect(v).toEqual({ name: 'PANADOL', quantity: 2 });
    const sent = client.requests[0]!;
    expect(sent.toolChoice).toEqual({ tool: 'answer' });
    expect(sent.tools?.[0]).toMatchObject({
      name: 'answer',
      description: 'A sale',
      inputSchema: { type: 'object', required: ['name', 'quantity'] },
    });
    expect(sent.tools?.[0]?.inputSchema).not.toHaveProperty('$schema');
  });

  it('an answer that fails the schema is logged invalid, shown to the model, and asked again', async () => {
    const { llm, client, log } = setup([
      fakeToolUse('answer', { name: '', quantity: 2.5 }, 'call_1'),
      fakeToolUse('answer', { name: 'PANADOL', quantity: 3 }, 'call_2'),
    ]);
    await expect(llm.json(Medicine, ask('?'), TAG)).resolves.toEqual({
      name: 'PANADOL',
      quantity: 3,
    });
    expect(log.calls.map((c) => [c.attempt, c.status])).toEqual([
      [1, 'invalid'],
      [2, 'ok'],
    ]);
    expect(log.calls[0]!.error).toMatch(/name: .*quantity: /);
    // The second request carries the bad answer and what was wrong with it.
    const repair = client.requests[1]!.messages;
    expect(repair).toHaveLength(3);
    expect(repair[1]!.role).toBe('assistant');
    const result = repair[2]!.content[0] as ToolResultBlock;
    expect(result).toMatchObject({ type: 'tool_result', toolUseId: 'call_1', isError: true });
    expect(String(result.content)).toMatch(/quantity/);
  });

  it('throws LlmSchemaError with the issues when no answer fits after the repairs', async () => {
    const bad = () => fakeToolUse('answer', { name: 'X' });
    const { llm, log } = setup([bad(), bad(), bad()]);
    const err = await llm.json(Medicine, ask('?'), { ...TAG, repairs: 2 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmSchemaError);
    expect((err as LlmSchemaError).issues.join(' ')).toMatch(/quantity/);
    expect(log.calls.map((c) => c.status)).toEqual(['invalid', 'invalid', 'invalid']);
  });

  it('a reply in words instead of the tool counts as invalid, and the model is told to use it', async () => {
    const { llm, client } = setup([
      fakeText('Two Panadol'),
      fakeToolUse('answer', { name: 'P', quantity: 1 }),
    ]);
    await expect(llm.json(Medicine, ask('?'), TAG)).resolves.toEqual({ name: 'P', quantity: 1 });
    expect(client.requests[1]!.messages[2]!.content[0]).toEqual({
      type: 'text',
      text: 'Answer by calling the answer tool.',
    });
  });

  it('only accepts object schemas (a tool input is a JSON object)', () => {
    expect(() => toolInputSchema(z.string())).toThrow(/object/);
    expect(toolInputSchema(Medicine)).toMatchObject({ type: 'object' });
  });
});

describe('CrewLlm.useTools', () => {
  const lookups: string[] = [];
  const findMedicine = crewTool({
    name: 'find_medicine',
    description: 'Looks a medicine up in MEDICINE.DBF',
    input: z.object({ name: z.string().min(1) }),
    run: ({ name }: { name: string }) => {
      lookups.push(name);
      if (name === 'BOOM') throw new Error('the file is locked');
      return { found: name === 'PANADOL', price: 250 };
    },
  });

  it('runs the tool with its checked input, sends the result back, and ends on words', async () => {
    lookups.length = 0;
    const { llm, client, log } = setup([
      fakeToolUse('find_medicine', { name: 'PANADOL' }, 't1'),
      fakeText('PANADOL costs 250 paisa'),
    ]);
    const run = await llm.useTools(ask('Is PANADOL in stock?'), [findMedicine], TAG);
    expect(run).toEqual({
      text: 'PANADOL costs 250 paisa',
      turns: 2,
      toolCalls: [
        {
          name: 'find_medicine',
          input: { name: 'PANADOL' },
          output: { found: true, price: 250 },
          isError: false,
        },
      ],
    });
    expect(lookups).toEqual(['PANADOL']);
    expect(client.requests[0]!.tools?.map((t) => t.name)).toEqual(['find_medicine']);
    expect(client.requests[1]!.messages[2]!.content[0]).toEqual({
      type: 'tool_result',
      toolUseId: 't1',
      content: { found: true, price: 250 },
      isError: false,
    });
    // Each turn is its own logged call, numbered.
    expect(log.calls.map((c) => [c.attempt, c.status])).toEqual([
      [1, 'ok'],
      [2, 'ok'],
    ]);
  });

  it('a tool input that fails its schema is not run: the model gets the error and retries', async () => {
    lookups.length = 0;
    const { llm, client } = setup([
      fakeToolUse('find_medicine', { name: 42 }, 't1'),
      fakeToolUse('find_medicine', { name: 'PANADOL' }, 't2'),
      fakeText('done'),
    ]);
    const run = await llm.useTools(ask('?'), [findMedicine], TAG);
    expect(lookups).toEqual(['PANADOL']);
    expect(run.toolCalls[0]).toMatchObject({
      isError: true,
      output: expect.stringMatching(/^Bad input: name:/),
    });
    const back = client.requests[1]!.messages[2]!.content[0] as ToolResultBlock;
    expect(back).toMatchObject({ toolUseId: 't1', isError: true });
  });

  it('an unknown tool and a tool that throws go back to the model as errors', async () => {
    const { llm } = setup([
      fakeToolUse('delete_everything', {}),
      fakeToolUse('find_medicine', { name: 'BOOM' }),
      fakeText('gave up'),
    ]);
    const run = await llm.useTools(ask('?'), [findMedicine], TAG);
    expect(run.toolCalls.map((c) => [c.isError, c.output])).toEqual([
      [true, 'There is no tool named delete_everything'],
      [true, 'The tool failed: the file is locked'],
    ]);
    expect(run.text).toBe('gave up');
  });

  it('stops a model that never stops calling tools', async () => {
    const { llm } = setup(() => fakeToolUse('find_medicine', { name: 'PANADOL' }));
    await expect(
      llm.useTools(ask('?'), [findMedicine], { ...TAG, maxTurns: 3 }),
    ).rejects.toBeInstanceOf(LlmToolLoopError);
  });
});
