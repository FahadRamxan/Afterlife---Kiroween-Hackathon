// Rules without a model (review of 51-60, finding 2). When no language model is set up, the
// candidates for a value come from here: short expressions over the fields the value can see,
// with constants taken from the observations (a ratio of 0.17, a threshold at 5000). The verifier
// keeps one only if it explains every observation, the simplest; so a wrong guess costs nothing.
import Decimal from 'decimal.js';
import { DslDate, type Env } from '@afterlife/soul';
import { ruleName, type Effect, type EffectObservation } from './hypotheses';
import { envFor, type VerifyEntity } from './verify';

/** At most this many candidates for one value. */
export const MAX_ENUMERATED = 600;
/** Ratios are worked out from at most this many observations (the biggest bases first). */
const MAX_RATIO_BASES = 4;

const isDec = (v: unknown): v is Decimal => Decimal.isDecimal(v);
const num = (s: string) => new Decimal(s);
const tidy = (d: Decimal) => d.toString();

/** The numbers each env has under `head.field`, and the fields every env has a number for. */
function numericRefs(envs: Env[], labels: Set<string>): string[] {
  const out: string[] = [];
  const first = envs[0];
  if (!first) return out;
  for (const [head, rec] of Object.entries(first)) {
    if (head === 'items' || head === 'today' || !rec || typeof rec !== 'object') continue;
    for (const [field, v] of Object.entries(rec as Record<string, unknown>)) {
      if (!isDec(v)) continue;
      const ref = `${head}.${field}`;
      // A key or a link (a bill line's LINE, a receipt number) labels a record: not an amount.
      if (labels.has(ref)) continue;
      if (envs.every((e) => isDec((e[head] as Record<string, unknown> | undefined)?.[field])))
        out.push(ref);
    }
  }
  return out;
}

/** The number fields every line of every env has, for sums over `items`. */
function lineFields(envs: Env[]): string[] {
  const lists = envs.map((e) => e.items);
  if (!lists.length || !lists.every((l) => Array.isArray(l) && l.length)) return [];
  const all = lists.flat() as Record<string, unknown>[];
  return Object.keys(all[0]!).filter((f) => all.every((r) => isDec(r[f])));
}

/** The numbers typed in the observations' keys ("100.00{Enter}" gives 100), as tidy strings. */
function typed(observations: EffectObservation[]): Set<string> {
  const out = new Set<string>();
  for (const o of observations)
    for (const m of o.keys.matchAll(/(?:^|})(-?\d+(?:\.\d+)?)(?={|$)/g)) out.add(tidy(num(m[1]!)));
  return out;
}

const value = (env: Env, ref: string): Decimal | null => {
  const [head, field] = ref.split('.');
  const v = (env[head!] as Record<string, unknown> | undefined)?.[field!];
  return isDec(v) ? new Decimal(v.toString()) : null;
};

/**
 * The ratio constants worth trying for `target / base`: the observed ratio to 2 places (a rate
 * such as 0.17), and to 3 places as well. One observation fits a ratio made from it (a fee of
 * 1400 is "1400 times the 1 sibling"), so from one a ratio is kept only if it is a short rate
 * under 1, as a tax or a discount is (0.17, 0.1, 0.025).
 */
function ratios(pairs: { target: Decimal; base: Decimal; observation: string }[]): string[] {
  const out = new Set<string>();
  const usable = pairs.filter((p) => !p.base.isZero() && !p.target.isZero());
  if (!usable.length) return [];
  const many = new Set(usable.map((p) => p.observation)).size >= 2;
  // The ratio of each observation, biggest base first: a big base gives the most exact ratio, but
  // on small amounts truncation spoils it (0.19 of 1.16 is 0.16, the rate 0.17), and the base
  // whose value came out exact gives it (0.17 of 1.00). The verifier keeps only one that fits all.
  const sorted = [...usable].sort((a, b) => b.base.abs().cmp(a.base.abs()));
  for (const p of sorted.slice(0, MAX_RATIO_BASES)) {
    const r = p.target.div(p.base);
    for (const places of [2, 3]) {
      const c = r.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
      if (c.isZero() || c.eq(1)) continue;
      if (many || (c.sd() <= 2 && c.abs().lt(1))) out.add(tidy(c));
    }
  }
  return [...out];
}

/**
 * Candidates for one value, from the effects of it in the observations. Families, simplest first:
 * a constant, a field, today (a date), a sum over the lines, a times b, a minus b, a plus b, a minus
 * b plus c, trunc/round of a base times an observed ratio, and a threshold rule whose threshold
 * splits the observations where the value was 0 from the others.
 */
export function enumerateCandidates(
  effects: Effect[],
  observations: EffectObservation[],
  entities: VerifyEntity[],
  opts: { today?: string } = {},
): string[] {
  if (!effects.length) return [];
  const byId = new Map(observations.map((o) => [o.id, o]));
  const envs = effects.map((e) => envFor(e, byId.get(e.observation)!, entities, opts));
  const out: string[] = [];
  const add = (s: string) => {
    if (out.length < MAX_ENUMERATED && !out.includes(s)) out.push(s);
  };
  const isDate =
    effects.every((e) => /^\d{8}$/.test(e.after)) && envs.every((e) => e.today instanceof DslDate);
  // A date is today or nothing here: its digits (19980715) are not an amount.
  if (isDate) {
    add('today');
    return out;
  }
  const targets = effects.map((e) => (/^-?\d+(\.\d+)?$/.test(e.after) ? num(e.after) : null));
  if (targets.some((t) => t === null)) return out;
  const t = targets as Decimal[];
  // A constant: a value several observations agree on. One observation agrees with any constant,
  // so that alone is no evidence of one; nor is a value the Possessor typed (an amount of 100.00
  // typed on every entry is the input, not a rule).
  const distinct = new Set(effects.map((e) => e.observation)).size;
  if (
    t.every((x) => x.eq(t[0]!)) &&
    distinct >= 2 &&
    (t[0]!.isZero() || !typed(observations).has(tidy(t[0]!)))
  )
    add(tidy(t[0]!));

  const labels = new Set(
    entities.flatMap((e) => [
      ...(e.key ?? []).map((k) => `${ruleName(e.id)}.${k.toLowerCase()}`),
      ...(e.foreignKeys ?? []).flatMap((fk) =>
        fk.fields.map((f) => `${ruleName(e.id)}.${f.toLowerCase()}`),
      ),
      ...(e.counters ?? []).map((c) => `${ruleName(e.id)}.${c.field.toLowerCase()}`),
    ]),
  );
  const refs = numericRefs(envs, labels);
  const lines = lineFields(envs);
  for (const r of refs) add(r);
  for (const f of lines) add(`sum(items, x => x.${f})`);
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++)
      add(`sum(items, x => x.${lines[i]} * x.${lines[j]})`);
  for (let i = 0; i < refs.length; i++)
    for (let j = i + 1; j < refs.length; j++) add(`${refs[i]} * ${refs[j]}`);
  for (const a of refs) for (const b of refs) if (a !== b) add(`${a} - ${b}`);
  for (let i = 0; i < refs.length; i++)
    for (let j = i + 1; j < refs.length; j++) add(`${refs[i]} + ${refs[j]}`);
  for (const a of refs)
    for (const b of refs)
      for (const c of refs) if (a !== b && a !== c && b !== c) add(`${a} - ${b} + ${c}`);

  // A base times a ratio seen in the observations ("GST is 17% of what is left").
  const bases: { text: string; values: (Decimal | null)[] }[] = [
    ...refs.map((r) => ({ text: r, values: envs.map((e) => value(e, r)) })),
    ...refs.flatMap((a) =>
      refs
        .filter((b) => b !== a)
        .map((b) => ({
          text: `(${a} - ${b})`,
          values: envs.map((e) => {
            const x = value(e, a);
            const y = value(e, b);
            return x && y ? x.minus(y) : null;
          }),
        })),
    ),
  ];
  const scaled = (keep: (i: number) => boolean) => {
    const found: string[] = [];
    for (const b of bases) {
      const pairs = b.values
        .map((v, i) =>
          v && keep(i) ? { target: t[i]!, base: v, observation: effects[i]!.observation } : null,
        )
        .filter((x): x is { target: Decimal; base: Decimal; observation: string } => x !== null);
      for (const c of ratios(pairs))
        // Always to the paisa: a 1998 program truncated or rounded it, and a value with more
        // places than its field would come out different in the Vessel. Truncation first.
        found.push(`trunc(${b.text} * ${c}, 2)`, `round(${b.text} * ${c}, 2)`);
    }
    return found;
  };
  for (const s of scaled(() => true)) add(s);

  // A threshold: the value is 0 below it and something else above it (10% off over Rs 5,000).
  const zero = t.map((x) => x.isZero());
  if (zero.some(Boolean) && zero.some((z) => !z)) {
    const inner = scaled((i) => !zero[i]).slice(0, 30);
    for (const r of refs) {
      const vs = envs.map((e) => value(e, r));
      if (vs.some((v) => v === null)) continue;
      const off = vs.filter((_, i) => zero[i]) as Decimal[];
      const on = vs.filter((_, i) => !zero[i]) as Decimal[];
      const maxOff = Decimal.max(...off);
      const minOn = Decimal.min(...on);
      if (!maxOff.lt(minOn)) continue;
      for (const x of inner) {
        add(`if ${r} > ${tidy(maxOff)} then ${x} else 0`);
        add(`if ${r} >= ${tidy(minOn)} then ${x} else 0`);
      }
    }
  }
  return out;
}
