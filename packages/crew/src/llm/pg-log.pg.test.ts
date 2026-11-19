// Prompt 47: model calls are kept in llm_calls, and the token budget counts from there.
import { llmCalls, projects, eq } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeText, fakeToolUse } from './fake';
import { PgLlmCallLog } from './pg-log';
import { CrewLlm, LlmBudgetError } from './runtime';
import { z } from 'zod';

let t: TestDatabase;
let projectId: string;
beforeAll(async () => {
  t = await freshDatabase();
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  projectId = p!.id;
});
afterAll(async () => {
  await t.drop();
});

describe('PgLlmCallLog', () => {
  it('writes every attempt with its request, response and tokens, and sums them per project', async () => {
    const log = new PgLlmCallLog(t.db);
    const client = new FakeLlmClient([
      fakeToolUse('answer', { quantity: 'two' }),
      fakeToolUse('answer', { quantity: 2 }),
    ]);
    const llm = new CrewLlm({ client, log, projectId, budgetTokens: 10_000 });
    await expect(
      llm.json(
        z.object({ quantity: z.number().int() }),
        {
          messages: [{ role: 'user', content: [{ type: 'text', text: 'How many?' }] }],
          maxTokens: 50,
        },
        { agent: 'possessor', purpose: 'a quantity for the bill' },
      ),
    ).resolves.toEqual({ quantity: 2 });
    const rows = await t.db.select().from(llmCalls).where(eq(llmCalls.projectId, projectId));
    expect(rows.map((r) => [r.attempt, r.status])).toEqual([
      [1, 'invalid'],
      [2, 'ok'],
    ]);
    expect(rows[0]).toMatchObject({
      agent: 'possessor',
      purpose: 'a quantity for the bill',
      provider: 'fake',
      model: 'fake-model',
    });
    expect(rows[0]!.error).toMatch(/quantity/);
    expect((rows[1]!.response as { content: unknown[] }).content).toHaveLength(1);
    expect((rows[0]!.request as { messages: unknown[] }).messages).toHaveLength(1);
    const sum = rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0);
    await expect(log.tokensUsed(projectId)).resolves.toBe(sum);
  });

  it('the budget holds across runtimes (a re-run or a restarted worker)', async () => {
    const log = new PgLlmCallLog(t.db);
    const used = await log.tokensUsed(projectId);
    const llm = new CrewLlm({
      client: new FakeLlmClient([fakeText('x')]),
      log,
      projectId,
      budgetTokens: used,
    });
    await expect(
      llm.converse({ messages: [], maxTokens: 5 }, { agent: 'possessor', purpose: 'p' }),
    ).rejects.toBeInstanceOf(LlmBudgetError);
    const [last] = await t.db.select().from(llmCalls).where(eq(llmCalls.status, 'over_budget'));
    expect(last).toMatchObject({ inputTokens: 0, outputTokens: 0, response: null });
  });

  it('a project with no calls has used nothing, and deleting a project deletes its calls', async () => {
    const log = new PgLlmCallLog(t.db);
    await expect(log.tokensUsed('0190a6d2-0000-7000-8000-000000000099')).resolves.toBe(0);
    await t.db.delete(projects).where(eq(projects.id, projectId));
    expect(await t.db.select().from(llmCalls)).toEqual([]);
  });
});
