import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { colors, contrastRatio } from './tokens';

const theme = readFileSync(resolve(__dirname, 'theme.css'), 'utf8');

describe('Haunted Ledger tokens', () => {
  it('has the exact palette from the plan', () => {
    expect(colors).toEqual({
      graveyard: '#0B0F0C',
      phosphor: '#33FF66',
      ectoplasm: '#5EEAD4',
      candle: '#F5B544',
      bone: '#EDE6D6',
      blood: '#E5484D',
    });
  });

  it.each(Object.entries(colors))('theme.css defines --color-%s as %s', (name, hex) => {
    expect(theme.toLowerCase()).toContain(`--color-${name}: ${hex.toLowerCase()};`);
  });

  it('theme.css maps the three font families', () => {
    expect(theme).toContain('--font-mono: var(--font-plex-mono)');
    expect(theme).toContain('--font-sans: var(--font-inter)');
    expect(theme).toContain('--font-urdu: var(--font-nastaliq)');
  });

  it('theme.css turns off motion for prefers-reduced-motion', () => {
    expect(theme).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('every animated class stops under prefers-reduced-motion', () => {
    const reduced = theme.split('@media (prefers-reduced-motion: reduce)')[1] ?? '';
    const animated = [...theme.matchAll(/\.([a-z-]+)\s*\{[^}]*animation:/g)].map((m) => m[1]!);
    expect(animated.length).toBeGreaterThanOrEqual(3);
    for (const cls of [...animated, 'ghost-cursor', 'candle-flame'])
      expect(reduced, cls).toContain(`.${cls}`);
  });

  it('the dormant fog exists and is listed under reduced motion', () => {
    expect(theme).toMatch(/@keyframes fog-drift/);
    expect(theme).toMatch(/\.graveyard-fog\s*\{[^}]*animation:/);
  });
});

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('property: symmetric and between 1 and 21', () => {
    const hex = fc
      .integer({ min: 0, max: 0xffffff })
      .map((n) => '#' + n.toString(16).padStart(6, '0'));
    fc.assert(
      fc.property(hex, hex, (a, b) => {
        const r = contrastRatio(a, b);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(21);
        expect(contrastRatio(b, a)).toBeCloseTo(r, 10);
      }),
    );
  });

  it.each(['bone', 'phosphor', 'ectoplasm', 'candle'] as const)(
    '%s text on graveyard black meets WCAG AA (4.5:1)',
    (c) => {
      expect(contrastRatio(colors[c], colors.graveyard)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('blood red is AA for large text on graveyard black (3:1)', () => {
    expect(contrastRatio(colors.blood, colors.graveyard)).toBeGreaterThanOrEqual(3);
  });
});
