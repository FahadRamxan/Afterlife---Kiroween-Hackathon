// Prompt 47: "Show your work" lists a project's model calls and its token budget.
import { llmCalls } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { PgLlmCallStore } from './llm-calls';
import { PgProjectStore } from './projects-pg';

let t: TestDatabase;
let app: ReturnType<typeof buildApp>;
let projectId: string;
let other: string;
beforeAll(async () => {
  t = await freshDatabase();
  const projects = new PgProjectStore(t.db);
  app = buildApp(
    parseEnv({ LLM_TOKEN_BUDGET: '5000' }),
    { logger: false },
    { projects, llmCalls: new PgLlmCallStore(t.db) },
  );
  await app.ready();
  projectId = (await projects.create({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' }))
    .id;
  other = (await projects.create({ name: 'Iqra', source: 'graveyard', sourceApp: 'iqra' })).id;
  const base = {
    agent: 'possessor',
    provider: 'fake',
    model: 'fake-model',
    request: { messages: [{ role: 'user', content: [{ type: 'text', text: 'A quantity?' }] }] },
  };
  await t.db.insert(llmCalls).values([
    {
      ...base,
      projectId,
      purpose: 'a quantity',
      attempt: 1,
      status: 'invalid',
      response: { content: [] },
      error: 'quantity: expected number',
      inputTokens: 100,
      outputTokens: 20,
      durationMs: 800,
      createdAt: new Date('2026-11-01T10:00:00Z'),
    },
    {
      ...base,
      projectId,
      purpose: 'a quantity',
      attempt: 2,
      status: 'ok',
      response: { content: [{ type: 'text', text: '2' }] },
      inputTokens: 130,
      outputTokens: 10,
      durationMs: 700,
      createdAt: new Date('2026-11-01T10:00:01Z'),
    },
    { ...base, projectId: other, purpose: 'x', attempt: 1, status: 'ok', inputTokens: 999 },
  ]);
});
afterAll(async () => {
  await app.close();
  await t.drop();
});

describe('GET /api/projects/:id/llm-calls', () => {
  it('lists the project’s calls newest first, without their bodies, and the budget used', async () => {
    const res = await app.inject(`/api/projects/${projectId}/llm-calls`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.budget).toEqual({ tokens: 5000, used: 260 });
    expect(body.total).toBe(2);
    expect(
      body.calls.map((c: { attempt: number; status: string }) => [c.attempt, c.status]),
    ).toEqual([
      [2, 'ok'],
      [1, 'invalid'],
    ]);
    expect(body.calls[1]).toMatchObject({
      agent: 'possessor',
      purpose: 'a quantity',
      provider: 'fake',
      error: 'quantity: expected number',
      at: '2026-11-01T10:00:00.000Z',
    });
    expect(body.calls[0]).not.toHaveProperty('request');
  });

  it('gives one call with its request and response, only under its own project', async () => {
    const list = (await app.inject(`/api/projects/${projectId}/llm-calls`)).json();
    const id = list.calls[0].id as string;
    const one = await app.inject(`/api/projects/${projectId}/llm-calls/${id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({
      id,
      request: { messages: [{ role: 'user' }] },
      response: { content: [{ type: 'text', text: '2' }] },
    });
    expect((await app.inject(`/api/projects/${other}/llm-calls/${id}`)).statusCode).toBe(404);
  });

  it("an uploaded app is a real shop's: its calls are listed, but not what was sent or answered", async () => {
    const shop = await new PgProjectStore(t.db).create({
      name: 'My shop',
      source: 'upload',
      sourceApp: 'my-shop.zip',
    });
    await t.db.insert(llmCalls).values({
      projectId: shop.id,
      agent: 'possessor',
      purpose: 'a value for Code on NEW BILL',
      provider: 'fake',
      model: 'fake-model',
      attempt: 1,
      status: 'ok',
      request: { messages: [{ role: 'user', content: [{ type: 'text', text: 'secret screen' }] }] },
      response: { content: [{ type: 'text', text: 'PAN500' }] },
    });
    const list = (await app.inject(`/api/projects/${shop.id}/llm-calls`)).json();
    expect(list.calls).toHaveLength(1);
    expect(list.bodies).toBe('hidden');
    const one = await app.inject(`/api/projects/${shop.id}/llm-calls/${list.calls[0].id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json()).toMatchObject({ request: null, response: null, hidden: true });
    expect(one.body).not.toContain('secret screen');
    // A Graveyard sample's calls show their bodies: the data is our own.
    expect((await app.inject(`/api/projects/${projectId}/llm-calls`)).json().bodies).toBe('shown');
  });

  it('refuses bad ids and unknown projects; a project with no calls has an empty list', async () => {
    expect((await app.inject('/api/projects/nope/llm-calls')).statusCode).toBe(400);
    expect((await app.inject(`/api/projects/${projectId}/llm-calls/nope`)).statusCode).toBe(400);
    expect(
      (await app.inject('/api/projects/0190a6d2-0000-7000-8000-000000000099/llm-calls')).statusCode,
    ).toBe(404);
    const fresh = await new PgProjectStore(t.db).create({
      name: 'Bilal',
      source: 'graveyard',
      sourceApp: 'bilal',
    });
    const res = (await app.inject(`/api/projects/${fresh.id}/llm-calls`)).json();
    expect(res).toMatchObject({ total: 0, calls: [], budget: { tokens: 5000, used: 0 } });
  });

  it('without a database it says so', async () => {
    const bare = buildApp(parseEnv({}), { logger: false });
    const res = await bare.inject(`/api/projects/${projectId}/llm-calls`);
    expect(res.statusCode).toBe(503);
    await bare.close();
  });
});
