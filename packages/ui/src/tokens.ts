/** Haunted Ledger palette. Source of truth; theme.css must match (checked in tokens.test.ts). */
export const colors = {
  graveyard: '#0B0F0C',
  phosphor: '#33FF66',
  ectoplasm: '#5EEAD4',
  candle: '#F5B544',
  bone: '#EDE6D6',
  blood: '#E5484D',
} as const;

export type ColorName = keyof typeof colors;

/** Motion timings shared by every animation (Prompt 88 unifies Framer Motion on these). */
export const motion = { fast: 150, base: 300, slow: 600 } as const;

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
