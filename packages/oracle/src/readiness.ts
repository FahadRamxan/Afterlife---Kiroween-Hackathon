// Switch-over readiness (Prompt 78): is the reborn app ready to take over from the old one? From
// Ghost Twin's results: days of shadow use (the days transactions happened on), transactions
// matched, open mismatches, unknown actions. The rule: ready when 7 days and 200 or more
// transactions have matched with 0 open mismatches; the thresholds can be changed.

export type TwinResult = {
  occurredAt: string;
  /** null: not compared yet. */
  outcome: 'matched' | 'mismatched' | 'unknown' | null;
};

export type ReadinessRule = { days: number; matched: number; openMismatches: number };
export const DEFAULT_RULE: ReadinessRule = { days: 7, matched: 200, openMismatches: 0 };

export type Readiness = {
  days: number;
  matched: number;
  mismatched: number;
  unknown: number;
  pending: number;
  ready: boolean;
  /** 0 to 100: how far along; 100 exactly when ready. */
  score: number;
  /** What is still missing, in words. */
  reasons: string[];
  rule: ReadinessRule;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function readiness(events: TwinResult[], rule: ReadinessRule = DEFAULT_RULE): Readiness {
  const days = new Set(events.map((e) => e.occurredAt.slice(0, 10))).size;
  const count = (o: TwinResult['outcome']) => events.filter((e) => e.outcome === o).length;
  const [matched, mismatched, unknown, pending] = [
    count('matched'),
    count('mismatched'),
    count('unknown'),
    count(null),
  ];
  const reasons: string[] = [];
  if (days < rule.days)
    reasons.push(`${plural(rule.days - days, 'more day', 'more days')} of shadow use`);
  if (matched < rule.matched)
    reasons.push(
      plural(rule.matched - matched, 'more matched transaction', 'more matched transactions'),
    );
  if (mismatched > rule.openMismatches)
    reasons.push(plural(mismatched, 'open mismatch', 'open mismatches'));
  if (pending)
    reasons.push(`${plural(pending, 'transaction', 'transactions')} still being compared`);
  const ready = reasons.length === 0;
  // Days and matches each half of the way; anything still open keeps it short of 100.
  const part = (n: number, of: number) => (of > 0 ? Math.min(1, n / of) : 1);
  const raw = Math.floor(50 * part(days, rule.days) + 50 * part(matched, rule.matched));
  const score = ready ? 100 : Math.min(99, raw);
  return { days, matched, mismatched, unknown, pending, ready, score, reasons, rule };
}
