// The translate-soul job (Prompt 46): the project's newest Soul with every rule in Urdu, stored
// as the next version. The model proposes each translation and the glossary check decides
// (@afterlife/crew); a rule whose English was translated before comes from the cache.
import {
  CrewLlm,
  LlmBudgetError,
  LlmSchemaError,
  PgLlmCallLog,
  PgTranslationCache,
  translateSoul,
  type LlmClient,
} from '@afterlife/crew';
import { insertSoulVersion, latestSoulRow, type Db } from '@afterlife/db';
import { SoulSchema, numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import type { StepHandler } from './registry';

export const NO_MODEL =
  'No language model is set up on this worker (LLM_PROVIDER=bedrock with AWS credentials, or anthropic with ANTHROPIC_API_KEY), so the rules cannot be translated';

export function translateSoulStep(deps: {
  db: Db;
  llm: LlmClient | null;
  budgetTokens: number;
  now?: () => Date;
}): StepHandler {
  const { db } = deps;
  return async (ctx) => {
    const row = await latestSoulRow(db, ctx.projectId);
    if (!row) return { status: 'failed', reason: 'This project has no Soul to translate yet' };
    const soul = SoulSchema.parse(row.ir);
    const missing = soul.rules.filter((r) => !r.ur.trim()).length;
    if (missing === 0)
      return {
        status: 'done',
        output: { version: row.version, translated: 0, cached: 0, kept: soul.rules.length },
      };
    if (!deps.llm) return { status: 'failed', reason: NO_MODEL };
    const llm = new CrewLlm({
      client: deps.llm,
      log: new PgLlmCallLog(db),
      projectId: ctx.projectId,
      budgetTokens: deps.budgetTokens,
      signal: ctx.signal,
    });
    await ctx.log(`Translating ${missing} of ${soul.rules.length} rules into Urdu`);
    let r: Awaited<ReturnType<typeof translateSoul>>;
    try {
      r = await translateSoul(soul, { llm, cache: new PgTranslationCache(db) });
    } catch (e) {
      // Trying again gives the same answer: the budget is spent, or the model keeps missing the
      // glossary. Anything else (a throttled model) is retried by the job loop.
      if (e instanceof LlmBudgetError || e instanceof LlmSchemaError)
        return { status: 'failed', reason: e.message };
      throw e;
    }
    // Who wrote the rules does not change; the note says who wrote the Urdu.
    const next: Soul = {
      ...r.soul,
      provenance: {
        ...r.soul.provenance,
        createdAt: (deps.now ?? (() => new Date()))().toISOString(),
        note: `Urdu by ${llm.provider}/${llm.model}: ${r.translated} translated, ${r.cached} from the cache, ${r.kept} kept`,
      },
    };
    const version = await insertSoulVersion(db, ctx.projectId, (v, parent) => {
      const stored = numberSoul(next, ctx.projectId, v, parent);
      return { ir: stored, specMarkdown: specRequirements(stored) };
    });
    const output = { version, translated: r.translated, cached: r.cached, kept: r.kept };
    await ctx.emit('soul_updated', { ...output, reason: 'urdu' });
    await ctx.log(
      `Soul version ${version}: ${r.translated} rules translated, ${r.cached} from the cache`,
    );
    return { status: 'done', output };
  };
}
