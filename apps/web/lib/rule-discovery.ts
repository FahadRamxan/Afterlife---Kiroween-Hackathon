// Rule discovery in the Soul tab (Prompt 57): which rules were just exhumed (and so light a candle
// and write themselves in), the typewriter's text at a moment, and the summary banner's counts.
import type { LiveEvent } from './live';

/** How fast a rule card writes itself in. */
export const TYPE_MS_PER_CHAR = 18;

/**
 * The part of `text` typed after `elapsedMs`: whole characters (code points, so an Urdu letter or
 * an emoji is never cut in half), one per `msPerChar`.
 */
export function typed(text: string, elapsedMs: number, msPerChar = TYPE_MS_PER_CHAR): string {
  if (!(elapsedMs > 0)) return '';
  const chars = Array.from(text);
  const n = Math.floor(elapsedMs / msPerChar);
  return n >= chars.length ? text : chars.slice(0, n).join('');
}

/** How long `text` takes to write itself in. */
export const typingMs = (text: string, msPerChar = TYPE_MS_PER_CHAR) =>
  Array.from(text).length * msPerChar;

/**
 * The rules that were just exhumed: in the Soul now, and not in the one shown before. On the first
 * load (`shownBefore` null) nothing is new: those rules were found before the page opened.
 */
export function freshRules(shownBefore: ReadonlySet<string> | null, now: string[]): string[] {
  if (!shownBefore) return [];
  return now.filter((id) => !shownBefore.has(id));
}

/** The rule ids of the `rule_found` events after `afterSeq` (live, not from before the page). */
export function foundRuleIds(events: LiveEvent[], afterSeq: number): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type !== 'rule_found' || e.seq <= afterSeq) continue;
    const id = (e.payload as { ruleId?: unknown } | null)?.ruleId;
    if (typeof id === 'string' && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The newest event's seq, or -1: events up to it were there when the page opened. */
export const lastSeq = (events: LiveEvent[]) => events.reduce((m, e) => Math.max(m, e.seq), -1);
