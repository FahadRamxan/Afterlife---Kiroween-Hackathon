/** Tabs on /raise/[projectId], in the order the story unfolds. */
export const RAISE_TABS = [
  'possession',
  'soul',
  'proof',
  'exorcism',
  'ghost-twin',
  'living-soul',
] as const;
export type RaiseTab = (typeof RAISE_TABS)[number];
export const DEFAULT_TAB: RaiseTab = 'possession';

/** The tab from a ?tab= search param. Unknown values fall back to the first tab. */
export function parseTab(value: string | string[] | undefined): RaiseTab {
  const v = Array.isArray(value) ? value[0] : value;
  return (RAISE_TABS as readonly string[]).includes(v ?? '') ? (v as RaiseTab) : DEFAULT_TAB;
}
