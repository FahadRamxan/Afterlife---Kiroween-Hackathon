import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_FILES, MARK, bannerSvg, iconSvg, markSvg } from './brand';
import { colors, contrastRatio } from './tokens';

const ROOT = resolve(__dirname, '../../..');
const TOKEN_HEX = new Set(Object.values(colors).map((h) => h.toUpperCase()));
/** Every colour an SVG paints with. */
const paints = (svg: string) =>
  [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]!).filter((v) => v !== 'none');

describe('the Afterlife mark', () => {
  it('is three shapes: the tombstone arch, the ground, and the DOS cursor inside the arch', () => {
    expect(Object.keys(MARK)).toEqual(['arch', 'ground', 'cursor']);
    // The cursor sits inside the arch: between its sides, above the ground.
    const { cursor } = MARK;
    expect(cursor.x).toBeGreaterThan(9);
    expect(cursor.x + cursor.width).toBeLessThan(23);
    expect(cursor.y + cursor.height).toBeLessThan(27);
  });

  it('paints only with the design tokens: bone for the stone, ectoplasm for what lives again', () => {
    for (const svg of [markSvg(), iconSvg(), bannerSvg()])
      for (const p of paints(svg)) expect(TOKEN_HEX, p).toContain(p.toUpperCase());
    expect(markSvg()).toContain(`stroke="${colors.bone}"`);
    expect(markSvg()).toContain(`fill="${colors.ectoplasm}"`);
  });

  it('can be seen at favicon size: each colour has graphic contrast (3:1) on the graveyard', () => {
    expect(contrastRatio(colors.bone, colors.graveyard)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colors.ectoplasm, colors.graveyard)).toBeGreaterThanOrEqual(3);
    // Strokes no thinner than 2 units of 32: still a line at 16 px.
    expect(MARK.arch.strokeWidth).toBeGreaterThanOrEqual(2);
  });

  it('has a title for screen readers, and the icon has its own background', () => {
    for (const svg of [markSvg(), iconSvg(), bannerSvg()]) {
      expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).toMatch(/<title>Afterlife<\/title>/);
    }
    expect(iconSvg()).toContain(`fill="${colors.graveyard}"`);
    expect(bannerSvg()).toContain('Software that outlives its source code.');
  });

  it('the committed logo files are what brand.ts makes (UPDATE_GOLDEN=1 writes them)', () => {
    for (const [path, make] of Object.entries(BRAND_FILES)) {
      const file = resolve(ROOT, path);
      if (process.env.UPDATE_GOLDEN === '1') writeFileSync(file, make());
      expect(readFileSync(file, 'utf8'), path).toBe(make());
    }
  });
});
