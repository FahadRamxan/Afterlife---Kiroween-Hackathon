// Prompt 46: translations are cached in Postgres, so a re-run (or another project with the same
// rule) never asks the model again.
import { translations } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm } from '../llm/runtime';
import { PgTranslationCache } from './pg-cache';
import { ruleHash, translateText } from './translate';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

const llm = (client: FakeLlmClient, projectId: string) =>
  new CrewLlm({ client, log: new MemoryLlmCallLog(), projectId, budgetTokens: 100_000 });

describe('PgTranslationCache', () => {
  it('a translation made for one project is a cache hit for the next, across restarts', async () => {
    const en = 'Stock goes down by the quantity on each bill line.';
    const first = new FakeLlmClient([
      fakeToolUse('answer', { ur: 'ہر بل کی لائن پر اسٹاک اتنا کم ہوتا ہے' }),
    ]);
    const a = await translateText(en, {
      llm: llm(first, 'p1'),
      cache: new PgTranslationCache(t.db),
    });
    expect(a.cached).toBe(false);
    const [row] = await t.db.select().from(translations);
    expect(row).toMatchObject({ hash: ruleHash(en), en, ur: a.ur, model: 'fake/fake-model' });
    // A new cache object (a restarted worker) and another project.
    const second = new FakeLlmClient([]);
    const b = await translateText(en, {
      llm: llm(second, 'p2'),
      cache: new PgTranslationCache(t.db),
    });
    expect(b).toEqual({ ur: a.ur, cached: true });
    expect(second.requests).toHaveLength(0);
  });

  it('a second writer of the same hash keeps the first answer', async () => {
    const cache = new PgTranslationCache(t.db);
    await cache.set({ hash: 'h', en: 'x', ur: 'پہلا', model: 'm' });
    await cache.set({ hash: 'h', en: 'x', ur: 'دوسرا', model: 'm' });
    await expect(cache.get('h')).resolves.toBe('پہلا');
    await expect(cache.get('nope')).resolves.toBeNull();
  });
});
