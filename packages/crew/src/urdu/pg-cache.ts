// The translation cache in Postgres (the translations table), shared by every project.
import { eq, translations, type Db } from '@afterlife/db';
import type { TranslationCache } from './translate';

export class PgTranslationCache implements TranslationCache {
  constructor(private readonly db: Db) {}

  async get(hash: string): Promise<string | null> {
    const [row] = await this.db
      .select({ ur: translations.ur })
      .from(translations)
      .where(eq(translations.hash, hash));
    return row?.ur ?? null;
  }

  async set(e: { hash: string; en: string; ur: string; model: string }): Promise<void> {
    // Two workers translating the same rule at once: the first answer stays.
    await this.db.insert(translations).values(e).onConflictDoNothing();
  }
}
