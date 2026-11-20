// Archaeology scoring (Prompt 56): how much of a sample app's hidden truth (its manifest's
// `knownRules`, written by our team from the C source) the inferred Soul recovered. A hidden rule
// is recovered when the Soul has the same counter, or a rule for the same value whose expression
// is the same (exact) or gives the same value on every observation of the app's scripted scenario
// runs (equivalent). Precision: of what the Soul claims, how much is right. Recall: of the hidden
// rules, how many were recovered.
import { parseExpr, printExpr } from '@afterlife/soul';
import type { EffectObservation } from './hypotheses';
import { verifyCandidates, type VerifyEntity } from './verify';

/** The machine-checkable form of a hidden rule. `expression` is absent when the DSL cannot say it. */
export type Truth =
  | { kind: 'compute' | 'effect'; target: string; expression?: string }
  | { kind: 'validate'; expression?: string }
  | { kind: 'counter'; entity: string; field: string; pattern: string }
  /** A report or list the app prints: nothing in the data files shows it. */
  | { kind: 'report' };

/** `scenarios`: the app's scripted runs that show the rule (observation ids in the evidence). */
export type HiddenRule = { id: string; text: string; scenarios: string[]; truth: Truth };

export type InferredSoul = {
  rules: { id: string; kind: string; target?: string; expression: string }[];
  entities: { id: string; counters: { field: string; pattern: string }[] }[];
};

/**
 * The scripted scenario runs of the app (each observation's id is its scenario). A rule is checked
 * on the runs that show it, so the runs of a known legacy bug do not count against the truth.
 */
export type ScoreEvidence = { observations: EffectObservation[]; entities: VerifyEntity[] };

export type RuleScore = {
  id: string;
  /** exact or equivalent: recovered. wrong: the Soul has one for it, and it is not right. */
  status: 'exact' | 'equivalent' | 'wrong' | 'missed';
  /** What in the Soul it was matched with ("rule bill-gst", "counter bill.BILL_NO"). */
  by?: string;
};

export type Score = {
  known: number;
  /** Rules and counters in the Soul. */
  inferred: number;
  recovered: number;
  exact: number;
  /**
   * Right items / inferred items; null when the Soul claims nothing. Right: it recovered a hidden
   * rule, or it is a rule the hidden truth does not list (a bill's total) that gives the right
   * value on every scenario run.
   */
  precision: number | null;
  /** recovered / known. */
  recall: number;
  rules: RuleScore[];
  /** What the Soul claims that no hidden rule is about, and whether the scenario runs bear it out. */
  extra: { label: string; verified: boolean }[];
};

/** An expression in its printed form, so spacing and brackets do not matter; null if it does not parse. */
export function normalizeExpression(src: string): string | null {
  try {
    return printExpr(parseExpr(src));
  } catch {
    return null;
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function scoreSoul(
  hidden: HiddenRule[],
  soul: InferredSoul,
  evidence?: ScoreEvidence,
): Score {
  type Item = { label: string; used: boolean } & (
    | { type: 'rule'; kind: string; target?: string; expression: string }
    | { type: 'counter'; entity: string; field: string; pattern: string }
  );
  const items: Item[] = [
    ...soul.rules.map((r) => ({
      type: 'rule' as const,
      label: `rule ${r.id}`,
      used: false,
      kind: r.kind,
      ...(r.target ? { target: r.target } : {}),
      expression: r.expression,
    })),
    ...soul.entities.flatMap((e) =>
      e.counters.map((c) => ({
        type: 'counter' as const,
        label: `counter ${e.id}.${c.field}`,
        used: false,
        entity: e.id,
        field: c.field,
        pattern: c.pattern,
      })),
    ),
  ];
  const explains = (target: string, expression: string, scenarios: string[]) => {
    if (!evidence) return false;
    const runs = evidence.observations.filter((o) => scenarios.includes(o.id));
    const v = verifyCandidates(target, [expression], runs, evidence.entities);
    return v.effects > 0 && v.selected !== null;
  };
  // A rule the truth does not list is checked on the runs of every hidden rule.
  const ruleRuns = [...new Set(hidden.flatMap((h) => h.scenarios))];

  const rules: RuleScore[] = hidden.map((h) => {
    const t = h.truth;
    if (t.kind === 'report') return { id: h.id, status: 'missed' };
    if (t.kind === 'counter') {
      const it = items.find(
        (x) =>
          !x.used &&
          x.type === 'counter' &&
          x.entity === t.entity &&
          x.field.toUpperCase() === t.field.toUpperCase(),
      );
      if (!it || it.type !== 'counter') return { id: h.id, status: 'missed' };
      it.used = true;
      return { id: h.id, status: it.pattern === t.pattern ? 'exact' : 'wrong', by: it.label };
    }
    const truth = t.expression ? normalizeExpression(t.expression) : null;
    if (t.kind === 'validate') {
      const it = items.find(
        (x) =>
          !x.used &&
          x.type === 'rule' &&
          x.kind === 'validate' &&
          truth !== null &&
          normalizeExpression(x.expression) === truth,
      );
      if (!it) return { id: h.id, status: 'missed' };
      it.used = true;
      return { id: h.id, status: 'exact', by: it.label };
    }
    const it = items.find((x) => !x.used && x.type === 'rule' && x.target === t.target);
    if (!it || it.type !== 'rule') return { id: h.id, status: 'missed' };
    it.used = true;
    if (truth !== null && normalizeExpression(it.expression) === truth)
      return { id: h.id, status: 'exact', by: it.label };
    return {
      id: h.id,
      status: explains(t.target, it.expression, h.scenarios) ? 'equivalent' : 'wrong',
      by: it.label,
    };
  });
  const recovered = rules.filter((r) => r.status === 'exact' || r.status === 'equivalent').length;
  const extra = items
    .filter((x) => !x.used)
    .map((x) => ({
      label: x.label,
      verified: x.type === 'rule' && !!x.target && explains(x.target, x.expression, ruleRuns),
    }));
  const right = recovered + extra.filter((x) => x.verified).length;
  return {
    known: hidden.length,
    inferred: items.length,
    recovered,
    exact: rules.filter((r) => r.status === 'exact').length,
    precision: items.length ? round(right / items.length) : null,
    recall: hidden.length ? round(recovered / hidden.length) : 0,
    rules,
    extra,
  };
}

/** The README line: "Afterlife recovered 2 of 7 hidden rules in Shifa Medical Store". */
export function scoreSentence(name: string, s: Score): string {
  return `Afterlife recovered ${s.recovered} of ${s.known} hidden rules in ${name} (${s.exact} exact).`;
}
