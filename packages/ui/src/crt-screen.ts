// Pure helpers for CrtScreen (tested in crt-screen.test.ts).
import { VGA_PALETTE, type ScreenCell } from '@afterlife/screen';

/** The original app's colours: the 16 DOS text colours, as CSS. */
export function dosColour(index: number): string {
  const [r, g, b] = VGA_PALETTE[index] ?? VGA_PALETTE[7]!;
  return `rgb(${r} ${g} ${b})`;
}

export type CrtRun = { col: number; text: string; fg: number; bg: number };

/**
 * A row as runs of the same colours, so it renders as a few spans. A blank cell has no visible
 * foreground, so it joins its neighbours when the background matches.
 */
export function crtRuns(row: ScreenCell[]): CrtRun[] {
  const runs: CrtRun[] = [];
  row.forEach((c, col) => {
    const blank = c.char === ' ';
    const last = runs.at(-1);
    const lastBlank = last && last.text.trim() === '';
    if (last && last.bg === c.bg && (blank || lastBlank || last.fg === c.fg)) {
      last.text += c.char;
      if (!blank && lastBlank) last.fg = c.fg;
    } else runs.push({ col, text: c.char, fg: c.fg, bg: c.bg });
  });
  return runs;
}

export type CrtSpan = { row: number; col: number; length: number };
export type CrtCell = { row: number; col: number };

const at = (p: CrtCell) => `row ${p.row + 1}, column ${p.col + 1}`;

/** The overlays in words (rows and columns counted from 1), for screen readers. */
export function crtSummary({
  highlight,
  changed,
  ghost,
  cursor,
}: {
  highlight?: (CrtSpan & { label?: string }) | null;
  changed?: CrtSpan[];
  ghost?: CrtCell | null;
  cursor?: CrtCell | null;
}): string {
  const parts: string[] = [];
  if (highlight) parts.push(`Field ${highlight.label ?? `at ${at(highlight)}`} is highlighted.`);
  if (changed?.length) {
    const rows = [...new Set(changed.map((c) => c.row + 1))].sort((a, b) => a - b);
    parts.push(`Data changed on row${rows.length > 1 ? 's' : ''} ${rows.join(', ')}.`);
  }
  if (ghost) parts.push(`The agent is typing at ${at(ghost)}.`);
  if (cursor) parts.push(`The DOS cursor is at ${at(cursor)}.`);
  return parts.join(' ');
}
