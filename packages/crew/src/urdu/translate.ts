// Rules in simple Urdu (Prompt 46), for the shop owner who reads Urdu. The model proposes each
// translation; code decides: an answer is refused unless it is in Urdu script and uses every
// glossary word its English calls for, and the model is told what was missing. Translations are
// cached by the hash of the English and the glossary version, so a rule is translated once.
import { createHash } from 'node:crypto';
import type { Soul } from '@afterlife/soul';
import { z } from 'zod';
import type { CrewLlm } from '../llm/runtime';
import {
  GLOSSARY_VERSION,
  SHOP_GLOSSARY,
  glossaryIssues,
  glossaryLines,
  type GlossaryEntry,
} from './glossary';

export interface TranslationCache {
  get(hash: string): Promise<string | null>;
  set(entry: { hash: string; en: string; ur: string; model: string }): Promise<void>;
}

export class MemoryTranslationCache implements TranslationCache {
  readonly entries = new Map<string, { en: string; ur: string; model: string }>();
  async get(hash: string) {
    return this.entries.get(hash)?.ur ?? null;
  }
  async set(e: { hash: string; en: string; ur: string; model: string }) {
    this.entries.set(e.hash, { en: e.en, ur: e.ur, model: e.model });
  }
}

/** The cache key of a rule's English: the same text and glossary always give the same hash. */
export function ruleHash(en: string, glossaryVersion = GLOSSARY_VERSION): string {
  return createHash('sha256').update(`urdu-v${glossaryVersion}\n${en.trim()}`).digest('hex');
}

/** The Soul's rule texts are at most 500 characters, Urdu too. */
const MAX_UR = 500;

export function instructions(glossary: GlossaryEntry[] = SHOP_GLOSSARY): string {
  return [
    'You translate the business rules of a 1990s shop program into simple, everyday Urdu for',
    'a shopkeeper in Pakistan. Write in Urdu script (Nastaliq), in short plain sentences.',
    'Keep every number, amount, percentage and date exactly as written, in Western digits.',
    'Keep field and file names in capitals (like MEDICINE.DBF) as they are.',
    'Always use these words for these shop terms:',
    glossaryLines(glossary),
    'Answer only by calling the answer tool.',
  ].join('\n');
}

export type TranslateDeps = {
  llm: CrewLlm;
  cache: TranslationCache;
  glossary?: GlossaryEntry[];
};

/** One English text in Urdu: from the cache, or from the model and then cached. */
export async function translateText(
  en: string,
  deps: TranslateDeps,
): Promise<{ ur: string; cached: boolean }> {
  const glossary = deps.glossary ?? SHOP_GLOSSARY;
  const hash = ruleHash(en);
  const hit = await deps.cache.get(hash);
  if (hit !== null) return { ur: hit, cached: true };
  // The glossary check is part of the schema, so a refused answer goes back to the model with
  // what was missing (CrewLlm.json repairs it).
  const schema = z.object({
    ur: z
      .string()
      .trim()
      .min(1)
      .max(MAX_UR)
      .superRefine((ur, ctx) => {
        for (const message of glossaryIssues(en, ur, glossary))
          ctx.addIssue({ code: 'custom', message });
      }),
  });
  const { ur } = await deps.llm.json(
    schema,
    {
      system: instructions(glossary),
      messages: [{ role: 'user', content: [{ type: 'text', text: en }] }],
      maxTokens: 600,
      temperature: 0,
      describe: 'The rule in Urdu.',
    },
    { agent: 'archaeologist', purpose: 'translate a rule into Urdu' },
  );
  await deps.cache.set({ hash, en, ur, model: `${deps.llm.provider}/${deps.llm.model}` });
  return { ur, cached: false };
}

export type SoulTranslation = {
  soul: Soul;
  /** Rules sent to the model, rules answered from the cache, rules that already had Urdu. */
  translated: number;
  cached: number;
  kept: number;
};

/**
 * The Soul with Urdu for every rule. Rules that already have Urdu keep it (the owner or our team
 * may have written it), unless `force`.
 */
export async function translateSoul(
  soul: Soul,
  deps: TranslateDeps,
  opts: { force?: boolean } = {},
): Promise<SoulTranslation> {
  let translated = 0;
  let cached = 0;
  let kept = 0;
  const rules: Soul['rules'] = [];
  for (const rule of soul.rules) {
    if (rule.ur.trim() && !opts.force) {
      kept++;
      rules.push(rule);
      continue;
    }
    const r = await translateText(rule.en, deps);
    if (r.cached) cached++;
    else translated++;
    rules.push({ ...rule, ur: r.ur });
  }
  return { soul: { ...soul, rules }, translated, cached, kept };
}
