// The Afterlife logo: a tombstone arch standing on the ground, with a DOS cursor inside it.
// The stone is the dead app, the cursor is it running again. Three shapes on a 32-unit grid, so
// it still reads at 16 px. The web app draws it with CSS variables (LogoMark); the files for the
// favicon and the README are made here from the same shapes and the tokens, never by hand.
import { colors } from './tokens';

export const MARK = {
  /** The headstone: two sides and a round top, open at the bottom. */
  arch: { d: 'M9 27V15a7 7 0 0 1 14 0v12', strokeWidth: 2.5 },
  /** The ground it stands on. */
  ground: { d: 'M5 27h22', strokeWidth: 2.5 },
  /** The blinking DOS underscore: the app is alive. */
  cursor: { x: 12.5, y: 19.5, width: 7, height: 3.25, rx: 0.75 },
} as const;

const TITLE = '<title>Afterlife</title>';

/** The mark's shapes, for any colours (hex values or CSS variables). */
export function markShapes(c: { stone: string; cursor: string }): string {
  const line = (p: { d: string; strokeWidth: number }) =>
    `<path d="${p.d}" fill="none" stroke="${c.stone}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const k = MARK.cursor;
  return [
    line(MARK.arch),
    line(MARK.ground),
    `<rect x="${k.x}" y="${k.y}" width="${k.width}" height="${k.height}" rx="${k.rx}" fill="${c.cursor}"/>`,
  ].join('');
}

const open = (w: number, h: number, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}" role="img">`;

/** The mark alone, on a transparent background (for dark pages). */
export function markSvg(): string {
  return `${open(32, 32)}${TITLE}${markShapes({ stone: colors.bone, cursor: colors.ectoplasm })}</svg>\n`;
}

/** The favicon and app icon: the mark on a rounded graveyard square, so it shows on any tab. */
export function iconSvg(): string {
  return `${open(32, 32)}${TITLE}<rect width="32" height="32" rx="7" fill="${colors.graveyard}"/>${markShapes({ stone: colors.bone, cursor: colors.ectoplasm })}</svg>\n`;
}

/** The README banner: the mark, the name and the tagline on the graveyard. */
export function bannerSvg(): string {
  const font = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
  return [
    open(520, 160),
    TITLE,
    `<rect width="520" height="160" rx="20" fill="${colors.graveyard}"/>`,
    `<g transform="translate(40 32) scale(3)">${markShapes({ stone: colors.bone, cursor: colors.ectoplasm })}</g>`,
    `<text x="156" y="88" font-family="${font}" font-size="52" font-weight="600" letter-spacing="-1" fill="${colors.bone}">afterlife</text>`,
    `<text x="158" y="120" font-family="${font}" font-size="18" fill="${colors.bone}" fill-opacity="0.7">Software that outlives its source code.</text>`,
    '</svg>\n',
  ].join('');
}

/** The files made from the mark, by repo path. A test keeps them current. */
export const BRAND_FILES: Record<string, () => string> = {
  'apps/web/app/icon.svg': iconSvg,
  'docs/brand/afterlife-mark.svg': markSvg,
  'docs/brand/afterlife-icon.svg': iconSvg,
  'docs/brand/afterlife-banner.svg': bannerSvg,
};
