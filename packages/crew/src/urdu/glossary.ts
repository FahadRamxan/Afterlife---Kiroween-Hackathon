// The shop words a translation must use (Prompt 46). A Pakistani shopkeeper says "bill", "stock",
// "GST" and "udhaar" in Urdu exactly so, so the model is told these words and its answer is
// refused when one is missing. Matching is on the Urdu stem, so plurals and case endings pass
// (بلوں contains بل, گاہکوں contains گاہک).

export type GlossaryEntry = {
  /** English forms, matched as whole words, any case. */
  en: string[];
  /** The Urdu word the translation must contain. */
  ur: string;
};

/** Bumped whenever the glossary changes, so cached translations made without it are not used. */
export const GLOSSARY_VERSION = 1;

export const SHOP_GLOSSARY: GlossaryEntry[] = [
  { en: ['bill', 'bills', 'invoice', 'invoices'], ur: 'بل' },
  { en: ['stock'], ur: 'اسٹاک' },
  { en: ['GST', 'sales tax'], ur: 'جی ایس ٹی' },
  { en: ['udhaar', 'on credit', 'credit'], ur: 'ادھار' },
  { en: ['discount', 'discounts'], ur: 'رعایت' },
  { en: ['customer', 'customers'], ur: 'گاہک' },
  { en: ['medicine', 'medicines'], ur: 'دوا' },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w: string) => new RegExp(`(^|[^A-Za-z])${escape(w)}(?=$|[^A-Za-z])`, 'i');

/** Not an Arabic-script letter (U+0600 to U+06FF): what may come right before a glossary word. */
const NOT_LETTER = `[^${String.fromCharCode(0x0600)}-${String.fromCharCode(0x06ff)}]`;

/**
 * True when `word` starts a word of `ur`. Endings may follow it (a plural is the word plus an
 * ending), but a word that only has its letters inside (the Urdu for "before" holds the two
 * letters of "bill") does not count.
 */
const startsWord = (ur: string, word: string): boolean =>
  new RegExp(`(?:^|${NOT_LETTER})${escape(word)}`).test(ur);

/** The glossary entries whose English appears in the text. */
export function termsIn(en: string, glossary: GlossaryEntry[] = SHOP_GLOSSARY): GlossaryEntry[] {
  return glossary.filter((g) => g.en.some((w) => wordRe(w).test(en)));
}

/** True when the text has Urdu (Arabic-script) letters. */
export const hasUrduScript = (s: string): boolean => /[\u0600-\u06FF]/.test(s);

/**
 * What is wrong with `ur` as a translation of `en`, or nothing: not in Urdu script, or a shop
 * word not said the shopkeeper's way.
 */
export function glossaryIssues(
  en: string,
  ur: string,
  glossary: GlossaryEntry[] = SHOP_GLOSSARY,
): string[] {
  const issues: string[] = [];
  if (!hasUrduScript(ur)) issues.push('write the translation in Urdu script (Nastaliq)');
  for (const g of termsIn(en, glossary))
    if (!startsWord(ur, g.ur)) issues.push(`say "${g.en[0]}" as "${g.ur}"`);
  return issues;
}

/** The glossary as lines for the model's instructions. */
export const glossaryLines = (glossary: GlossaryEntry[] = SHOP_GLOSSARY): string =>
  glossary.map((g) => `- ${g.en.join(' / ')}: ${g.ur}`).join('\n');
