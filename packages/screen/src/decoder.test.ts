import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ScreenDecodeError,
  VGA_PALETTE,
  canonicalCell,
  decodeCell,
  decodeScreen,
  glyph,
  gridText,
  renderCell,
  renderScreen,
  type CellInput,
} from './decoder';
import { decodePng } from './png';
import { cp437ToUnicode } from './cp437';

const FIXTURES = resolve(__dirname, '../fixtures');
const GRAVEYARD = resolve(__dirname, '../../../samples/graveyard/fixtures');

type Capture = {
  app: string;
  scr: string;
  keys: string;
  backend: string;
  png: string;
  width: number;
};
const captures: Capture[] = JSON.parse(readFileSync(resolve(FIXTURES, 'captures.json'), 'utf8'));

// DOSBox-X ignores DATE (scripts/screen-capture.ts), so on its frames the date at the end of the
// title bar shows its own clock, not the one DOSBox had. Only those cells are not compared; they
// must still read as a date in the app's own format (15/07/98, 12-03-2001).
const DATE = /\d\d([/-])\d\d\1\d{2,4}/;
const spans = new Map<Capture, { from: number; to: number } | null>();
function clockSpan(c: Capture): { from: number; to: number } | null {
  if (c.backend !== 'dosboxXDirect') return null;
  if (!spans.has(c)) {
    const top = readFileSync(resolve(GRAVEYARD, `${c.app}/${c.scr}.SCR`), 'latin1').split(
      /\r?\n/,
    )[0]!;
    const m = DATE.exec(top);
    spans.set(c, m ? { from: m.index, to: m.index + m[0].length } : null);
  }
  return spans.get(c)!;
}
const isClock = (c: Capture, row: number, col: number) => {
  const span = clockSpan(c);
  return !!span && row === 0 && col >= span.from && col < span.to;
};

/** A DOSBox memory dump (see samples/graveyard/README.md): 25 lines of CP437 bytes, then attributes. */
function readScr(path: string) {
  const lines = readFileSync(resolve(GRAVEYARD, `${path}.SCR`), 'latin1').split(/\r?\n/);
  const sep = lines.indexOf('--ATTR--');
  return Array.from({ length: 25 }, (_, row) =>
    Array.from({ length: 80 }, (_, col) => {
      const attr = parseInt(lines[sep + 1 + row]!.slice(col * 2, col * 2 + 2), 16);
      return { code: lines[row]!.charCodeAt(col), fg: attr & 15, bg: attr >> 4 };
    }),
  );
}

describe('the VGA fonts read off the emulator', () => {
  it('has the IBM VGA glyphs: A, the box corner and the blank and solid cells', () => {
    expect(glyph(0x41, 16).map((b) => b.toString(16))).toEqual([
      '0',
      '0',
      '10',
      '38',
      '6c',
      'c6',
      'c6',
      'fe',
      'c6',
      'c6',
      'c6',
      'c6',
      '0',
      '0',
      '0',
      '0',
    ]);
    expect(glyph(0xda, 16).slice(7)).toEqual([
      0x1f, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18,
    ]);
    expect(glyph(0x20, 16).every((b) => b === 0)).toBe(true);
    expect(glyph(0xdb, 16).every((b) => b === 0xff)).toBe(true);
    expect(glyph(0x41, 8).some((b) => b !== 0)).toBe(true);
  });

  it('almost every glyph is unique, so a cell is identified by its pixels', () => {
    for (const h of [16, 8] as const) {
      const distinct = new Set(Array.from({ length: 256 }, (_, c) => glyph(c, h).join(',')));
      expect(distinct.size, `8x${h}`).toBeGreaterThan(250);
    }
  });
});

describe.each(captures)('decodeScreen on js-dos $backend: $app $scr', (c) => {
  const img = decodePng(new Uint8Array(readFileSync(resolve(FIXTURES, c.png))));
  const grid = decodeScreen(img.rgba, img.width, img.height);
  const expected = readScr(`${c.app}/${c.scr}`);

  it('finds an 80x25 grid of 8 or 9 by 16 pixel cells', () => {
    expect([grid.cols, grid.rows, grid.cellWidth, grid.cellHeight]).toEqual([
      80,
      25,
      img.width / 80,
      16,
    ]);
  });

  it("matches DOSBox's own memory dump: 100% of characters and colours", () => {
    const wrong: string[] = [];
    for (let row = 0; row < 25; row++)
      for (let col = 0; col < 80; col++) {
        const e = expected[row]![col]!;
        if (isClock(c, row, col)) continue;
        const atCursor = grid.cursor?.row === row && grid.cursor?.col === col;
        // The cursor cell is compared with how that cell looks with the cursor drawn on it.
        const want = atCursor
          ? decodeCell(renderCell(e.code, e.fg, e.bg, grid.cellWidth, 16, true), grid.cellWidth, 16)
              .cell
          : canonicalCell(e.code, e.fg, e.bg, 16, grid.cellWidth);
        const got = grid.cells[row]![col]!;
        if (got.code !== want.code || got.fg !== want.fg || got.bg !== want.bg)
          wrong.push(`${row},${col}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      }
    expect(wrong.slice(0, 10)).toEqual([]);
    const span = clockSpan(c);
    if (span) expect(gridText(grid)[0]!.slice(span.from, span.to)).toMatch(DATE);
  });

  it("is exactly what our renderer draws from DOSBox's dump, pixel for pixel", () => {
    const drawn = renderScreen({
      cellWidth: grid.cellWidth,
      cellHeight: 16,
      cells: expected,
      cursor: grid.cursor,
    });
    let differ = 0;
    for (let i = 0; i < drawn.rgba.length; i += 4) {
      const x = (i / 4) % img.width;
      const y = Math.floor(i / 4 / img.width);
      if (isClock(c, Math.floor(y / 16), Math.floor(x / grid.cellWidth))) continue;
      if (
        drawn.rgba[i] !== img.rgba[i] ||
        drawn.rgba[i + 1] !== img.rgba[i + 1] ||
        drawn.rgba[i + 2] !== img.rgba[i + 2]
      )
        differ++;
    }
    expect(differ).toBe(0);
  });

  it('reads the text line by line, as Unicode', () => {
    const text = gridText(grid);
    expect(text).toHaveLength(25);
    for (let row = c.backend === 'dosboxXDirect' ? 1 : 0; row < 25; row++) {
      const want = cp437ToUnicode(Uint8Array.from(expected[row]!, (e) => e.code));
      // Blank cells (NUL, space, 255, or a colour with no glyph) read as spaces.
      expect(text[row]!.trimEnd(), `row ${row}`).toBe(
        want.replace(/[\u2400\u00a0]/g, ' ').trimEnd(),
      );
    }
  });
});

describe('the cursor', () => {
  it('is found after "Choice:" on the Shifa menu when it is drawn', () => {
    for (const w of [640, 720]) {
      const img = decodePng(
        new Uint8Array(readFileSync(resolve(FIXTURES, `shifa-menu-menu-${w}.png`))),
      );
      const grid = decodeScreen(img.rgba, img.width, img.height);
      // The cursor blinks, so a screenshot may catch it off.
      if (grid.cursor) expect(grid.cursor).toEqual({ row: 18, col: 40 });
      expect(grid.cells[18]![40]).toMatchObject({ code: 0x20, bg: 1 });
    }
  });

  it('is reported where the renderer drew it, and the character under it still reads', () => {
    const cells = blankCells(25, 0x1f);
    cells[3]![7] = { code: 0x41, fg: 14, bg: 1 };
    const img = renderScreen({ cellWidth: 8, cellHeight: 16, cells, cursor: { row: 3, col: 7 } });
    const grid = decodeScreen(img.rgba, img.width, img.height);
    expect(grid.cursor).toEqual({ row: 3, col: 7 });
    expect(grid.cells[3]![7]).toEqual({ code: 0x41, char: 'A', fg: 14, bg: 1 });
  });
});

function blankCells(rows: number, attr: number): CellInput[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: attr & 15, bg: attr >> 4 })),
  );
}

describe('80x50 (8x8 font)', () => {
  it('decodes every character in every colour pair in a 50-line screen', () => {
    const cells = blankCells(50, 0x07);
    for (let i = 0; i < 256; i++) cells[Math.floor(i / 80)]![i % 80] = { code: i, fg: 15, bg: 1 };
    for (let i = 0; i < 256; i++)
      cells[10 + Math.floor(i / 80)]![i % 80] = { code: 0x41 + (i % 26), fg: i & 15, bg: i >> 4 };
    const img = renderScreen({ cellWidth: 8, cellHeight: 8, cells });
    const grid = decodeScreen(img.rgba, img.width, img.height);
    expect([grid.rows, grid.cellHeight]).toEqual([50, 8]);
    for (let r = 0; r < 50; r++)
      for (let c = 0; c < 80; c++) {
        const e = cells[r]![c]!;
        expect(grid.cells[r]![c], `${r},${c}`).toMatchObject(canonicalCell(e.code, e.fg, e.bg, 8));
      }
  });
});

describe('canonicalCell (what a cell looks like, so what can be read back)', () => {
  it('a blank glyph reads as a space in the background colour', () => {
    expect(canonicalCell(0x00, 14, 1, 16)).toEqual({ code: 0x20, char: ' ', fg: 1, bg: 1 });
    expect(canonicalCell(0xff, 14, 1, 16)).toEqual({ code: 0x20, char: ' ', fg: 1, bg: 1 });
  });

  it('a solid block reads as a space in the foreground colour', () => {
    expect(canonicalCell(0xdb, 14, 1, 16)).toEqual({ code: 0x20, char: ' ', fg: 14, bg: 14 });
  });

  it('text with the same foreground and background is invisible, so blank', () => {
    expect(canonicalCell(0x41, 3, 3, 16)).toEqual({ code: 0x20, char: ' ', fg: 3, bg: 3 });
  });

  it('an ordinary character keeps its code and colours', () => {
    expect(canonicalCell(0x41, 15, 1, 16)).toEqual({ code: 0x41, char: 'A', fg: 15, bg: 1 });
  });
});

describe('decodeScreen errors', () => {
  it.each([
    [800, 600],
    [640, 480],
    [320, 200],
  ])('refuses a %dx%d frame (not an 80-column text mode)', (w, h) => {
    expect(() => decodeScreen(new Uint8Array(w * h * 4), w, h)).toThrow(ScreenDecodeError);
  });

  it('refuses a buffer of the wrong size', () => {
    expect(() => decodeScreen(new Uint8Array(10), 640, 400)).toThrow(ScreenDecodeError);
  });
});

describe('VGA_PALETTE', () => {
  it('is the 16 DOS colours', () => {
    expect(VGA_PALETTE).toHaveLength(16);
    expect(VGA_PALETTE[1]).toEqual([0x00, 0x00, 0xaa]);
    expect(VGA_PALETTE[6]).toEqual([0xaa, 0x55, 0x00]); // brown, not dark yellow
    expect(VGA_PALETTE[15]).toEqual([0xff, 0xff, 0xff]);
  });
});
