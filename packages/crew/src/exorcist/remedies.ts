// Keep or fix (Prompt 74): what each choice does to the Soul. Keep copies the old app's behaviour
// exactly (the proof stays strict); Fix uses the corrected rule (the proof accepts the difference,
// and the certificate lists it). Both are edits of the Soul's rules, made from the finding: the
// field it is about and the rules that already touch that field. A bug the rule language cannot
// say (calendar weeks) cannot be fixed here, and says so.
import { parseExpr, type Rule, type Soul } from '@afterlife/soul';
import { capacity } from './detectors';
import type { Finding } from './types';

export type RuleEdit =
  { op: 'add'; rule: Rule } | { op: 'set'; id: string; expression: string; en: string; ur: string };

export type Remedy = {
  keep: RuleEdit[];
  /** null: no fix can be made in the rule language; `why` says why. */
  fix: RuleEdit[] | null;
  why?: string;
  /** What the fix does, for the card and the certificate. */
  fixEn: string;
  fixUr: string;
};

const refOf = (target: string) => {
  const [entity, field] = target.split('.') as [string, string];
  return { entity, field, ref: `${entity}.${field}` };
};
/** A date in two-digit years, as the old app compares it: YYMMDD. */
const yymmdd = (d: string) => `(year(${d}) % 100) * 10000 + month(${d}) * 100 + day(${d})`;

const refsIn = (expression: string): string[] => {
  const out: string[] = [];
  const walk = (e: unknown): void => {
    if (!e || typeof e !== 'object') return;
    const x = e as { type?: string; path?: string[] };
    if (x.type === 'ref' && x.path) out.push(x.path.join('.'));
    for (const v of Object.values(e)) if (typeof v === 'object') walk(v);
  };
  try {
    walk(parseExpr(expression));
  } catch {
    // An expression the language cannot read touches nothing.
  }
  return out;
};

/** A validate rule written by the Exorcist, its id from the finding. */
const rule = (
  f: Finding,
  kind: 'keep' | 'fix',
  expression: string,
  en: string,
  ur: string,
): Rule => ({
  id: `exorcist-${kind}-${f.code.replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`,
  kind: 'validate',
  en,
  ur,
  expression,
  evidence: [],
  confidence: 1,
});

export function remedyFor(f: Finding, soul: Soul): Remedy {
  if (!f.target) return none('It is not about one field of the data, so no rule can fix it.');
  const t = refOf(f.target);
  const entity = soul.entities.find((e) => e.id.replace(/-/g, '_') === t.entity);
  const field = entity?.fields.find((x) => x.name.toLowerCase() === t.field);
  if (!entity || !field) return none(`The Soul has no field ${f.target}.`);
  switch (f.smell) {
    case 'two-digit-year': {
      // The rule that compares the date with today: rewritten (or added) both ways.
      const existing = soul.rules.find(
        (r) =>
          r.kind === 'validate' &&
          refsIn(r.expression).includes(t.ref) &&
          refsIn(r.expression).includes('today'),
      );
      const keepExpr = `${yymmdd(t.ref)} >= ${yymmdd('today')}`;
      const fixExpr = `${t.ref} >= today`;
      const keepEn = `A ${entity.name.toLowerCase()} whose ${field.name} is past cannot be used, comparing two-digit years as the old app does (so 2000 counts as before 1998).`;
      const keepUr = `جس ${entity.name} کی ${field.name} گزر چکی ہو وہ استعمال نہیں ہو سکتا، پرانی ایپ کی طرح دو ہندسوں والے سال سے جانچ کر (یعنی 2000 کو 1998 سے پہلے سمجھ کر)۔`;
      const fixEn = `A ${entity.name.toLowerCase()} whose ${field.name} is past cannot be used, comparing the full four-digit date.`;
      const fixUr = `جس ${entity.name} کی ${field.name} گزر چکی ہو وہ استعمال نہیں ہو سکتا، پوری چار ہندسوں والی تاریخ سے جانچ کر۔`;
      return {
        keep: [
          existing
            ? { op: 'set', id: existing.id, expression: keepExpr, en: keepEn, ur: keepUr }
            : { op: 'add', rule: rule(f, 'keep', keepExpr, keepEn, keepUr) },
        ],
        fix: [
          existing
            ? { op: 'set', id: existing.id, expression: fixExpr, en: fixEn, ur: fixUr }
            : { op: 'add', rule: rule(f, 'fix', fixExpr, fixEn, fixUr) },
        ],
        fixEn: `${field.name} is compared with four-digit years`,
        fixUr: `${field.name} چار ہندسوں والے سال سے جانچی جاتی ہے`,
      };
    }
    case 'negative-allowed':
    case 'numeric-overflow': {
      const effect = soul.rules.find((r) => r.kind === 'effect' && r.target === t.ref);
      if (!effect)
        return none(`No rule of the Soul works out ${f.target}, so there is nothing to bound.`);
      const neg = f.smell === 'negative-allowed';
      const max = capacity(field).toFixed(field.decimals);
      const expression = neg ? `${effect.expression} >= 0` : `${effect.expression} <= ${max}`;
      const en = neg
        ? `${entity.name} ${field.name} cannot go below zero.`
        : `${entity.name} ${field.name} cannot go above ${max}, the most its field holds.`;
      const ur = neg
        ? `${entity.name} کا ${field.name} صفر سے نیچے نہیں جا سکتا۔`
        : `${entity.name} کا ${field.name} ${max} سے اوپر نہیں جا سکتا، جو اس کی فیلڈ میں زیادہ سے زیادہ آتا ہے۔`;
      return {
        keep: [],
        fix: [{ op: 'add', rule: rule(f, 'fix', expression, en, ur) }],
        fixEn: en.replace(/\.$/, ''),
        fixUr: ur,
      };
    }
    case 'missing-validation': {
      const en = `A ${entity.name.toLowerCase()} needs a ${field.name.toLowerCase()}.`;
      const ur = `${entity.name} کے لیے ${field.name} ضروری ہے۔`;
      return {
        keep: [],
        fix: [{ op: 'add', rule: rule(f, 'fix', `${t.ref} != ''`, en, ur) }],
        fixEn: en.replace(/\.$/, ''),
        fixUr: ur,
      };
    }
    case 'date-arithmetic':
      return none(
        'The rule language cannot count calendar weeks or say when a fee is due yet, so this one can only be kept.',
      );
    default:
      return none('This is not something a rule of the app can change.');
  }
}

const none = (why: string): Remedy => ({ keep: [], fix: null, why, fixEn: '', fixUr: '' });

/** The Soul with the edits made (a rule set by id, or added; an added id already there is set). */
export function applyEdits(soul: Soul, edits: RuleEdit[]): Soul {
  let rules = [...soul.rules];
  for (const e of edits) {
    if (e.op === 'set')
      rules = rules.map((r) =>
        r.id === e.id ? { ...r, expression: e.expression, en: e.en, ur: e.ur } : r,
      );
    else
      rules = rules.some((r) => r.id === e.rule.id)
        ? rules.map((r) => (r.id === e.rule.id ? e.rule : r))
        : [...rules, e.rule];
  }
  return { ...soul, rules };
}

/**
 * The Soul that does what the old app does: each fix undone into its keep (the remedies as worked
 * out when the owner decided). The Oracle runs it next to the reborn app, so a difference it
 * explains is the fix, accepted, not a failure.
 */
export function undoFixes(soul: Soul, remedies: Remedy[]): Soul {
  let s = soul;
  for (const r of remedies) {
    const added = new Set((r.fix ?? []).flatMap((e) => (e.op === 'add' ? [e.rule.id] : [])));
    s = applyEdits({ ...s, rules: s.rules.filter((x) => !added.has(x.id)) }, r.keep);
  }
  return s;
}
