// Counters (the ids an app gives out itself), as a Soul's entity `counters` describe them. The
// Archaeologist finds the pattern (Prompt 53); the Vessel gives out the next id with it (Prompt 58).

/** The counter pattern of a plain number the app gives out: one more than the highest. */
export const NUMBER_COUNTER = 'n+1';

/** The next id of a counter: one more than the highest (of this month, for YYMM ones). */
export function nextCounter(
  pattern: string,
  ids: string[],
  now?: { year: number; month: number },
): string | null {
  const width = /#+$/.exec(pattern)?.[0].length ?? 0;
  if (!width) return null;
  let prefix = pattern.slice(0, pattern.length - width);
  if (prefix.startsWith('YYMM')) {
    if (!now) return null;
    prefix = `${String(now.year % 100).padStart(2, '0')}${String(now.month).padStart(2, '0')}${prefix.slice(4)}`;
  }
  const nums = ids
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  const out = `${prefix}${String(next).padStart(width, '0')}`;
  return out.length === pattern.length ? out : null;
}

/**
 * The next value of any counter: `n+1` is one more than the highest number, any other pattern is
 * `nextCounter`. Null when the pattern cannot give one (a YYMM pattern with no date).
 */
export function nextId(
  pattern: string,
  ids: string[],
  now?: { year: number; month: number },
): string | null {
  if (pattern !== NUMBER_COUNTER) return nextCounter(pattern, ids, now);
  const nums = ids.filter((id) => /^\d+$/.test(id.trim())).map((id) => Number(id.trim()));
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}
