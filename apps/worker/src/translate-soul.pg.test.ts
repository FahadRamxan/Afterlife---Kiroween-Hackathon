// Prompt 46: the translate-soul job stores the Soul with its rules in Urdu as the next version.
import {
  FakeLlmClient,
  fakeToolUse,
  glossaryIssues,
  termsIn,
  type LlmRequest,
} from '@afterlife/crew';
import { insertSoulVersion, llmCalls, projects, souls, translations, eq } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { SoulSchema, numberSoul, specRequirements } from '@afterlife/soul';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../packages/soul/src/examples/shifa';
import type { StepContext } from './registry';
import { NO_MODEL, translateSoulStep } from './translate-soul';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function project() {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  await insertSoulVersion(t.db, p!.id, (v, parent) => {
    const s = numberSoul(SHIFA_REFERENCE_SOUL, p!.id, v, parent);
    return { ir: s, specMarkdown: specRequirements(s) };
  });
  return p!.id;
}

function ctx(projectId: string) {
  const events: { type: string; payload: unknown }[] = [];
  const c: StepContext = {
    projectId,
    project: { name: 'Shifa', source: 'graveyard', sourceApp: 'shifa', dosTime: null },
    step: 'translate-soul',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => void events.push({ type, payload }),
    log: async (message) => void events.push({ type: 'log', payload: { message } }),
  };
  return { c, events };
}

/** Answers each rule with Urdu holding the glossary words its English needs. */
const model = () =>
  new FakeLlmClient((req: LlmRequest) => {
    const en = (req.messages[0]!.content[0] as { text: string }).text;
    return fakeToolUse('answer', { ur: ['اصول:', ...termsIn(en).map((g) => g.ur)].join(' ') });
  });

describe('translate-soul', () => {
  it('stores the next version with every rule in Urdu, logs the calls and caches the answers', async () => {
    const id = await project();
    const { c, events } = ctx(id);
    const r = await translateSoulStep({ db: t.db, llm: model(), budgetTokens: 100_000 })(c);
    const n = SHIFA_REFERENCE_SOUL.rules.length;
    expect(r).toEqual({
      status: 'done',
      output: { version: 2, translated: n, cached: 0, kept: 0 },
    });
    const [v2] = await t.db.select().from(souls).where(eq(souls.version, 2));
    const soul = SoulSchema.parse(v2!.ir);
    expect(soul.provenance).toMatchObject({
      parentVersion: 1,
      createdBy: 'reference',
      projectId: id,
    });
    expect(soul.provenance.note).toMatch(/^Urdu by fake\/fake-model: 7 translated/);
    for (const rule of soul.rules) expect(glossaryIssues(rule.en, rule.ur)).toEqual([]);
    expect(v2!.specMarkdown).toContain(soul.rules[0]!.ur);
    expect(events.find((e) => e.type === 'soul_updated')?.payload).toMatchObject({ version: 2 });
    const calls = await t.db.select().from(llmCalls).where(eq(llmCalls.projectId, id));
    expect(calls.map((x) => x.agent)).toEqual(Array(n).fill('archaeologist'));
    expect(await t.db.select().from(translations)).toHaveLength(n);
  });

  it('the cache is hit on a re-run: another project with the same rules makes no model call', async () => {
    const id = await project();
    const client = new FakeLlmClient([]);
    const r = await translateSoulStep({ db: t.db, llm: client, budgetTokens: 100_000 })(ctx(id).c);
    expect(r).toMatchObject({ status: 'done', output: { translated: 0, cached: 7 } });
    expect(client.requests).toHaveLength(0);
  });

  it('a Soul already in Urdu is left as it is', async () => {
    const id = await project();
    await translateSoulStep({ db: t.db, llm: model(), budgetTokens: 100_000 })(ctx(id).c);
    const again = await translateSoulStep({ db: t.db, llm: null, budgetTokens: 0 })(ctx(id).c);
    expect(again).toEqual({
      status: 'done',
      output: { version: 2, translated: 0, cached: 0, kept: 7 },
    });
  });

  it('fails with the reason, and is not retried, without a model, a Soul or budget', async () => {
    const id = await project();
    // The cache would answer: use rules it has not seen.
    await t.db.delete(translations);
    expect(await translateSoulStep({ db: t.db, llm: null, budgetTokens: 1 })(ctx(id).c)).toEqual({
      status: 'failed',
      reason: NO_MODEL,
    });
    const over = await translateSoulStep({ db: t.db, llm: model(), budgetTokens: 0 })(ctx(id).c);
    expect(over).toMatchObject({ status: 'failed', reason: expect.stringMatching(/tokens/) });
    const [bare] = await t.db
      .insert(projects)
      .values({ name: 'Empty', source: 'graveyard', sourceApp: 'iqra' })
      .returning();
    expect(
      await translateSoulStep({ db: t.db, llm: model(), budgetTokens: 100 })(ctx(bare!.id).c),
    ).toEqual({ status: 'failed', reason: 'This project has no Soul to translate yet' });
  });
});
