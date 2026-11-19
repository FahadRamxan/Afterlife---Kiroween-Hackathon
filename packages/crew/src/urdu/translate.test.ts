import { SoulSchema } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../../../soul/src/examples/shifa';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm, LlmSchemaError } from '../llm/runtime';
import type { LlmRequest, ToolResultBlock } from '../llm/types';
import { glossaryIssues, termsIn } from './glossary';
import {
  MemoryTranslationCache,
  instructions,
  ruleHash,
  translateSoul,
  translateText,
} from './translate';

const PROJECT = '0190a6d2-0000-7000-8000-000000000001';
const llmWith = (client: FakeLlmClient) =>
  new CrewLlm({ client, log: new MemoryLlmCallLog(), projectId: PROJECT, budgetTokens: 1_000_000 });
const answer = (ur: string) => fakeToolUse('answer', { ur });
/** A stand-in model that answers with a fixed Urdu sentence holding every glossary word asked for. */
const glossaryModel = (req: LlmRequest) => {
  const en = (req.messages[0]!.content[0] as { text: string }).text;
  const words = termsIn(en).map((g) => g.ur);
  return answer(['یہ اصول', ...words].join(' '));
};

describe('the glossary', () => {
  it('finds shop terms as whole words, in any case', () => {
    expect(termsIn('GST is 17% of the bill').map((g) => g.ur)).toEqual(['بل', 'جی ایس ٹی']);
    expect(termsIn('Udhaar is allowed up to the credit limit').map((g) => g.ur)).toEqual(['ادھار']);
    expect(termsIn('Billing date')).toEqual([]);
    expect(termsIn('The STOCK goes down')).toHaveLength(1);
  });

  it('refuses a translation that is not Urdu or misses a shop word', () => {
    expect(glossaryIssues('The bill total', 'The bill total')).toContain(
      'write the translation in Urdu script (Nastaliq)',
    );
    expect(glossaryIssues('Stock goes down after a bill', 'فروخت کے بعد مال کم ہوتا ہے')).toEqual([
      'say "bill" as "بل"',
      'say "stock" as "اسٹاک"',
    ]);
    expect(glossaryIssues('Stock goes down after a bill', 'بل کے بعد اسٹاک کم ہوتا ہے')).toEqual(
      [],
    );
    // Plurals and case endings keep the stem.
    expect(glossaryIssues('Bills of customers', 'گاہکوں کے بلوں')).toEqual([]);
  });

  it('is in the model’s instructions', () => {
    const text = instructions();
    for (const w of ['bill', 'stock', 'GST', 'udhaar', 'بل', 'اسٹاک', 'جی ایس ٹی', 'ادھار'])
      expect(text).toContain(w);
  });
});

describe('translateText', () => {
  it('the glossary is applied: an answer without the shop word is refused and asked again', async () => {
    const client = new FakeLlmClient([
      answer('اس رسید پر سترہ فیصد ٹیکس لگتا ہے'),
      answer('اس بل پر 17% جی ایس ٹی لگتا ہے'),
    ]);
    const r = await translateText('GST is 17% of the bill', {
      llm: llmWith(client),
      cache: new MemoryTranslationCache(),
    });
    expect(r).toEqual({ ur: 'اس بل پر 17% جی ایس ٹی لگتا ہے', cached: false });
    const repair = client.requests[1]!.messages[2]!.content[0] as ToolResultBlock;
    expect(repair.isError).toBe(true);
    expect(String(repair.content)).toContain('say "bill" as "بل"');
    expect(String(repair.content)).toContain('say "GST" as "جی ایس ٹی"');
    expect(client.requests[0]!.system).toContain('udhaar / on credit / credit: ادھار');
  });

  it('gives up with the reason when the model never uses the glossary', async () => {
    const client = new FakeLlmClient(() => answer('ٹیکس'));
    await expect(
      translateText('GST is 17%', { llm: llmWith(client), cache: new MemoryTranslationCache() }),
    ).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it('keys the cache by the English text and the glossary version', () => {
    expect(ruleHash('A bill')).toBe(ruleHash('  A bill '));
    expect(ruleHash('A bill')).not.toBe(ruleHash('A bills'));
    expect(ruleHash('A bill', 1)).not.toBe(ruleHash('A bill', 2));
    expect(ruleHash('A bill')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('translateSoul', () => {
  it('translates every rule of Shifa, and the result is still a valid Soul', async () => {
    const client = new FakeLlmClient(glossaryModel);
    const r = await translateSoul(SHIFA_REFERENCE_SOUL, {
      llm: llmWith(client),
      cache: new MemoryTranslationCache(),
    });
    const n = SHIFA_REFERENCE_SOUL.rules.length;
    expect(r).toMatchObject({ translated: n, cached: 0, kept: 0 });
    for (const rule of r.soul.rules) {
      expect(rule.ur).not.toBe('');
      expect(glossaryIssues(rule.en, rule.ur)).toEqual([]);
    }
    expect(SoulSchema.safeParse(r.soul).success).toBe(true);
  });

  it('the cache is hit on a re-run: no rule goes to the model twice', async () => {
    const cache = new MemoryTranslationCache();
    const first = new FakeLlmClient(glossaryModel);
    const a = await translateSoul(SHIFA_REFERENCE_SOUL, { llm: llmWith(first), cache });
    const second = new FakeLlmClient([]);
    const b = await translateSoul(SHIFA_REFERENCE_SOUL, { llm: llmWith(second), cache });
    expect(second.requests).toHaveLength(0);
    expect(b).toMatchObject({ translated: 0, cached: SHIFA_REFERENCE_SOUL.rules.length });
    expect(b.soul.rules.map((r) => r.ur)).toEqual(a.soul.rules.map((r) => r.ur));
  });

  it('two rules with the same English are one model call', async () => {
    const rule = SHIFA_REFERENCE_SOUL.rules[0]!;
    const soul = {
      ...SHIFA_REFERENCE_SOUL,
      rules: [rule, { ...rule, id: `${rule.id}-copy` }],
    };
    const client = new FakeLlmClient(glossaryModel);
    const r = await translateSoul(soul, {
      llm: llmWith(client),
      cache: new MemoryTranslationCache(),
    });
    expect(client.requests).toHaveLength(1);
    expect(r).toMatchObject({ translated: 1, cached: 1 });
  });

  it('keeps Urdu someone already wrote, unless forced', async () => {
    const soul = {
      ...SHIFA_REFERENCE_SOUL,
      rules: SHIFA_REFERENCE_SOUL.rules.map((r, i) => (i === 0 ? { ...r, ur: 'مالک نے لکھا' } : r)),
    };
    const client = new FakeLlmClient(glossaryModel);
    const r = await translateSoul(soul, {
      llm: llmWith(client),
      cache: new MemoryTranslationCache(),
    });
    expect(r.kept).toBe(1);
    expect(r.soul.rules[0]!.ur).toBe('مالک نے لکھا');
    const forced = await translateSoul(
      soul,
      { llm: llmWith(new FakeLlmClient(glossaryModel)), cache: new MemoryTranslationCache() },
      { force: true },
    );
    expect(forced.kept).toBe(0);
    expect(forced.soul.rules[0]!.ur).not.toBe('مالک نے لکھا');
  });
});
