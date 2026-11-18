// Text-mode screen decoder (Prompt 22): turns a DOS VGA screenshot back into characters and
// colours by matching each cell's pixels against the VGA ROM font. No OCR: a cell either is
// exactly a glyph in two colours, or it is unknown.
import { CP437, cp437ToUnicode } from './cp437';
import { FONT_8X16, FONT_8X8 } from './vga-font';

/** The 16 DOS text colours as DOSBox draws them (index = attribute nibble). */
export const VGA_PALETTE: readonly (readonly [number, number, number])[] = [
  [0x00, 0x00, 0x00],
  [0x00, 0x00, 0xaa],
  [0x00, 0xaa, 0x00],
  [0x00, 0xaa, 0xaa],
  [0xaa, 0x00, 0x00],
  [0xaa, 0x00, 0xaa],
  [0xaa, 0x55, 0x00],
  [0xaa, 0xaa, 0xaa],
  [0x55, 0x55, 0x55],
  [0x55, 0x55, 0xff],
  [0x55, 0xff, 0x55],
  [0x55, 0xff, 0xff],
  [0xff, 0x55, 0x55],
  [0xff, 0x55, 0xff],
  [0xff, 0xff, 0x55],
  [0xff, 0xff, 0xff],
];

export type CellHeight = 16 | 8;
export type CellWidth = 8 | 9;

/** One character cell: CP437 code (-1 if no glyph matched), its Unicode text, colours 0-15. */
export type ScreenCell = { code: number; char: string; fg: number; bg: number };

export type ScreenGrid = {
  cols: 80;
  rows: 25 | 50;
  cellWidth: CellWidth;
  cellHeight: CellHeight;
  /** cells[row][col] */
  cells: ScreenCell[][];
  /** Where the blinking cursor is drawn in this frame, or null (hidden, or blinked off). */
  cursor: { row: number; col: number } | null;
};

export class ScreenDecodeError extends Error {
  override name = 'ScreenDecodeError';
}

const FONTS: Record<CellHeight, Uint8Array> = {
  16: Uint8Array.from(atob(FONT_8X16), (c) => c.charCodeAt(0)),
  8: Uint8Array.from(atob(FONT_8X8), (c) => c.charCodeAt(0)),
};

/** The BIOS default cursor: scanlines 13-14 of a 16-line cell, 6-7 of an 8-line cell. */
const CURSOR_ROWS: Record<CellHeight, readonly number[]> = { 16: [13, 14], 8: [6, 7] };

/** The pixel rows of a glyph, most significant bit on the left. */
export function glyph(code: number, height: CellHeight): number[] {
  return Array.from(FONTS[height].subarray(code * height, (code + 1) * height));
}

const BLANK = 0x20;

/** In 9-pixel cells the 9th column repeats the 8th for 0xC0-0xDF (line drawing), else background. */
const ninthIsFg = (code: number, row: number) => code >= 0xc0 && code <= 0xdf && (row & 1) === 1;

type Lookup = { exact: Map<string, number>; underCursor: Map<string, number> };

/** Glyph rows -> the lowest code with that glyph; and the same with the cursor rows left out. */
const LOOKUP: Record<CellHeight, Lookup> = (() => {
  const build = (h: CellHeight): Lookup => {
    const exact = new Map<string, number>();
    const underCursor = new Map<string, number>();
    const skip = new Set(CURSOR_ROWS[h]);
    for (let code = 255; code >= 0; code--) {
      const g = glyph(code, h);
      exact.set(g.join(','), code);
      underCursor.set(g.filter((_, y) => !skip.has(y)).join(','), code);
    }
    // A blank cell reads as a space rather than NUL.
    exact.set(new Array(h).fill(0).join(','), BLANK);
    underCursor.set(new Array(h - skip.size).fill(0).join(','), BLANK);
    return { exact, underCursor };
  };
  return { 16: build(16), 8: build(8) };
})();

const cellOf = (code: number, fg: number, bg: number): ScreenCell =>
  code === BLANK
    ? { code: BLANK, char: ' ', fg: bg, bg }
    : { code, char: cp437ToUnicode(new Uint8Array([code])), fg, bg };

const UNKNOWN: ScreenCell = { code: -1, char: '\uFFFD', fg: 0, bg: 0 };

/**
 * One cell as palette indexes, row by row (width x height), drawn the way DOSBox draws it.
 * In 9-pixel cells the 9th column repeats the 8th for the line-drawing characters 0xC0-0xDF,
 * else it is background. The cursor fills its rows of the first 8 columns in the foreground.
 */
export function renderCell(
  code: number,
  fg: number,
  bg: number,
  width: CellWidth,
  height: CellHeight,
  cursor: boolean,
): Uint8Array {
  const out = new Uint8Array(width * height);
  const rows = glyph(code, height);
  const cursorRows = new Set(cursor ? CURSOR_ROWS[height] : []);
  for (let y = 0; y < height; y++) {
    const bits = cursorRows.has(y) ? 0xff : rows[y]!;
    for (let x = 0; x < 8; x++) out[y * width + x] = bits & (0x80 >> x) ? fg : bg;
    if (width === 9) out[y * width + 8] = !cursorRows.has(y) && ninthIsFg(code, rows[y]!) ? fg : bg;
  }
  return out;
}

/**
 * Reads one cell (palette indexes, as renderCell gives). A cell must be exactly a glyph in two
 * colours, or a glyph with the cursor over it; anything else is unknown (code -1). Of the
 * readings that draw exactly these pixels, the one with the lowest code is returned.
 */
export function decodeCell(
  px: Uint8Array,
  width: CellWidth,
  height: CellHeight,
): { cell: ScreenCell; cursor: boolean } {
  const colours = new Set(px);
  if (colours.size === 1) {
    const c = px[0]!;
    return { cell: cellOf(BLANK, c, c), cursor: false };
  }
  if (colours.size > 2) return { cell: UNKNOWN, cursor: false };
  const [c1, c2] = [...colours] as [number, number];
  const mask = (fg: number) =>
    Array.from({ length: height }, (_, y) => {
      let bits = 0;
      for (let x = 0; x < 8; x++) if (px[y * width + x] === fg) bits |= 0x80 >> x;
      return bits;
    });
  const { exact, underCursor } = LOOKUP[height];
  const cursorRows = CURSOR_ROWS[height];
  // A reading counts only if drawing it gives back exactly these pixels (9th column included).
  const draws = (code: number, fg: number, bg: number, cursor: boolean) => {
    const again = renderCell(code, fg, bg, width, height, cursor);
    return again.every((v, i) => v === px[i]);
  };
  const read = (cursor: boolean) => {
    let best: { code: number; fg: number; bg: number } | null = null;
    for (const [fg, bg] of [
      [c1, c2],
      [c2, c1],
    ] as const) {
      const m = mask(fg);
      if (cursor && !cursorRows.every((y) => m[y] === 0xff)) continue;
      const key = (cursor ? m.filter((_, y) => !cursorRows.includes(y)) : m).join(',');
      const code = (cursor ? underCursor : exact).get(key);
      if (code === undefined || !draws(code, fg, bg, cursor)) continue;
      if (!best || code < best.code) best = { code, fg, bg };
    }
    return best;
  };
  const plain = read(false);
  if (plain) return { cell: cellOf(plain.code, plain.fg, plain.bg), cursor: false };
  const under = read(true);
  if (under) {
    const { code, fg, bg } = under;
    // Under the cursor even a blank has a visible foreground: the cursor's colour.
    return {
      cell: code === BLANK ? { code, char: ' ', fg, bg } : cellOf(code, fg, bg),
      cursor: true,
    };
  }
  return { cell: UNKNOWN, cursor: false };
}

const UNDERSCORE = 0x5f;

/**
 * The cursor covers the only rows where "_" differs from a blank, so under the cursor the two
 * draw the same pixels. A blank read under the cursor is "_" when the cell beside it is "_" in the
 * same colours: an empty "____" input field then reads the same whether the blinking cursor is on
 * or off, and keeps its length (and the screen its fingerprint).
 */
function resolveCursorCell(grid: ScreenGrid): ScreenGrid {
  const at = grid.cursor;
  const line = at ? grid.cells[at.row] : undefined;
  const c = at && line?.[at.col];
  if (!at || !line || !c || c.code !== BLANK) return grid;
  const { cellWidth: w, cellHeight: h } = grid;
  const same = renderCell(UNDERSCORE, c.fg, c.bg, w, h, true).every(
    (v, i) => v === renderCell(BLANK, c.fg, c.bg, w, h, true)[i],
  );
  const beside = [line[at.col - 1], line[at.col + 1]];
  if (same && beside.some((n) => n?.code === UNDERSCORE && n.fg === c.fg && n.bg === c.bg))
    line[at.col] = cellOf(UNDERSCORE, c.fg, c.bg);
  return grid;
}

/**
 * True when two characters cannot be told apart in a cell the cursor is drawn on, because the
 * cursor covers their only difference: "_" and a space, "q" and "g". Two frames of a blinking
 * cursor can read such a cell differently, and that is not a change on the screen.
 */
export function lookAlikeUnderCursor(a: string, b: string, height: CellHeight = 16): boolean {
  if (a === b) return true;
  const ca = a === ' ' ? BLANK : CP437.indexOf(a);
  const cb = b === ' ' ? BLANK : CP437.indexOf(b);
  if (ca < 0 || cb < 0) return false;
  // Width 9 also compares the 9th column, so a pair that matches here matches in 8-pixel cells.
  const pa = renderCell(ca, 15, 0, 9, height, true);
  const pb = renderCell(cb, 15, 0, 9, height, true);
  return pa.every((v, i) => v === pb[i]);
}

/**
 * What a cell looks like, which is all a screenshot can tell, so what decodeScreen returns for a
 * cell drawn with this code and these colours: a blank glyph or text in its own background colour
 * is a space in the background colour, a solid block is a space in the foreground colour, and of
 * glyphs that look the same (a glyph and its inverse in swapped colours) the lowest code wins.
 * In 9-pixel cells the 9th column can tell such a pair apart.
 */
export function canonicalCell(
  code: number,
  fg: number,
  bg: number,
  height: CellHeight,
  width: CellWidth = 8,
): ScreenCell {
  // A screen built from cells (live events, Prompt 38) asks this 2,000 times, mostly for the
  // same few cells, and each answer costs glyph comparisons: remember the answers.
  const key = `${code},${fg},${bg},${height},${width}`;
  let hit = CANONICAL.get(key);
  if (!hit) CANONICAL.set(key, (hit = computeCanonicalCell(code, fg, bg, height, width)));
  return { ...hit };
}
const CANONICAL = new Map<string, ScreenCell>();
function computeCanonicalCell(
  code: number,
  fg: number,
  bg: number,
  height: CellHeight,
  width: CellWidth,
): ScreenCell {
  if (fg === bg) return cellOf(BLANK, fg, bg);
  const rows = glyph(code, height);
  const ninth = rows.map((r) => (ninthIsFg(code, r) ? fg : bg));
  const lit = rows.every((r) => r === 0xff) && (width === 8 || ninth.every((v) => v === fg));
  if (rows.every((r) => r === 0)) return cellOf(BLANK, fg, bg);
  if (lit) return cellOf(BLANK, fg, fg);
  const look = LOOKUP[height].exact;
  const options: [number, number, number][] = [];
  for (const [c, f, b] of [
    [look.get(rows.join(',')), fg, bg],
    [look.get(rows.map((r) => ~r & 0xff).join(',')), bg, fg],
  ] as const) {
    if (c === undefined) continue;
    const n = glyph(c, height).map((r) => (ninthIsFg(c, r) ? f : b));
    if (width === 9 && n.some((v, y) => v !== ninth[y])) continue;
    options.push([c, f, b]);
  }
  options.sort((x, y) => x[0] - y[0]);
  const [c, f, b] = options[0]!;
  return cellOf(c, f, b);
}

const PALETTE_INDEX = new Map(VGA_PALETTE.map(([r, g, b], i) => [(r << 16) | (g << 8) | b, i]));

function paletteIndex(r: number, g: number, b: number): number {
  const exact = PALETTE_INDEX.get((r << 16) | (g << 8) | b);
  if (exact !== undefined) return exact;
  let best = 0;
  let dist = Infinity;
  VGA_PALETTE.forEach(([pr, pg, pb], i) => {
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < dist) [best, dist] = [i, d];
  });
  return best;
}

function decodeAs(
  idx: Uint8Array,
  width: number,
  cellWidth: CellWidth,
  cellHeight: CellHeight,
): { grid: ScreenGrid; unknown: number } {
  const rows = (400 / cellHeight) as 25 | 50;
  const px = new Uint8Array(cellWidth * cellHeight);
  const cells: ScreenCell[][] = [];
  let cursor: ScreenGrid['cursor'] = null;
  let unknown = 0;
  for (let row = 0; row < rows; row++) {
    const line: ScreenCell[] = [];
    for (let col = 0; col < 80; col++) {
      for (let y = 0; y < cellHeight; y++)
        for (let x = 0; x < cellWidth; x++)
          px[y * cellWidth + x] = idx[(row * cellHeight + y) * width + col * cellWidth + x]!;
      const d = decodeCell(px, cellWidth, cellHeight);
      if (d.cell.code < 0) unknown++;
      if (d.cursor && !cursor) cursor = { row, col };
      line.push(d.cell);
    }
    cells.push(line);
  }
  const grid = resolveCursorCell({ cols: 80, rows, cellWidth, cellHeight, cells, cursor });
  return { grid, unknown };
}

/**
 * Decodes an 80x25 (8x16 font) or 80x50 (8x8 font) text screen from an RGBA frame of 640x400 or
 * 720x400 (9-pixel cells). The row count is whichever reads with fewer unknown cells.
 */
export function decodeScreen(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): ScreenGrid {
  if (rgba.length !== width * height * 4)
    throw new ScreenDecodeError(`Expected ${width * height * 4} bytes of RGBA, got ${rgba.length}`);
  if ((width !== 640 && width !== 720) || height !== 400)
    throw new ScreenDecodeError(
      `A ${width}x${height} frame is not an 80-column VGA text screen (640x400 or 720x400)`,
    );
  const cellWidth = (width / 80) as CellWidth;
  const idx = new Uint8Array(width * height);
  for (let i = 0; i < idx.length; i++)
    idx[i] = paletteIndex(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
  const tall = decodeAs(idx, width, cellWidth, 16);
  if (tall.unknown === 0) return tall.grid;
  const short = decodeAs(idx, width, cellWidth, 8);
  return short.unknown < tall.unknown ? short.grid : tall.grid;
}

export type CellInput = { code: number; fg: number; bg: number };

/** Draws a text screen the way DOSBox does (for tests, and to check a decode). RGBA out. */
export function renderScreen({
  cellWidth,
  cellHeight,
  cells,
  cursor,
}: {
  cellWidth: CellWidth;
  cellHeight: CellHeight;
  cells: CellInput[][];
  cursor?: { row: number; col: number } | null;
}): { width: number; height: number; rgba: Uint8Array } {
  const width = 80 * cellWidth;
  const height = cells.length * cellHeight;
  const rgba = new Uint8Array(width * height * 4);
  cells.forEach((line, row) =>
    line.forEach((c, col) => {
      const on = !!cursor && cursor.row === row && cursor.col === col;
      const px = renderCell(c.code, c.fg, c.bg, cellWidth, cellHeight, on);
      for (let y = 0; y < cellHeight; y++)
        for (let x = 0; x < cellWidth; x++) {
          const [r, g, b] = VGA_PALETTE[px[y * cellWidth + x]!]!;
          const p = ((row * cellHeight + y) * width + col * cellWidth + x) * 4;
          rgba[p] = r;
          rgba[p + 1] = g;
          rgba[p + 2] = b;
          rgba[p + 3] = 0xff;
        }
    }),
  );
  return { width, height, rgba };
}

/** The screen's text, one string of 80 characters per row (unknown cells are U+FFFD). */
export function gridText(grid: ScreenGrid): string[] {
  return grid.cells.map((line) => line.map((c) => c.char).join(''));
}

/**
 * The grid decodeScreen would read from a screen drawn with these cells (each cell in its
 * canonical form). For tests, and for screens recorded as text and attributes.
 */
export function gridFromCells(
  cells: CellInput[][],
  { cellWidth = 8, cursor = null }: { cellWidth?: CellWidth; cursor?: ScreenGrid['cursor'] } = {},
): ScreenGrid {
  const rows = cells.length;
  if (rows !== 25 && rows !== 50)
    throw new ScreenDecodeError(`A text screen has 25 or 50 rows, not ${rows}`);
  const cellHeight: CellHeight = rows === 25 ? 16 : 8;
  return resolveCursorCell({
    cols: 80,
    rows,
    cellWidth,
    cellHeight,
    cells: cells.map((line, r) =>
      line.map((c, col) =>
        cursor && cursor.row === r && cursor.col === col
          ? decodeCell(
              renderCell(c.code, c.fg, c.bg, cellWidth, cellHeight, true),
              cellWidth,
              cellHeight,
            ).cell
          : canonicalCell(c.code, c.fg, c.bg, cellHeight, cellWidth),
      ),
    ),
    cursor,
  });
}
