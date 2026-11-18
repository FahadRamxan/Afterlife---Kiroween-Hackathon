// The blinking DOS cursor covers pixel rows 13 and 14, the only rows where "_" differs from a
// blank (and "q" from "g"). Found in the Prompts 21 to 30 review: with the cursor on an empty
// "____" field, the field read one shorter and the fingerprint flipped at every blink.
import { describe, expect, it } from 'vitest';
import {
  decodeScreen,
  gridText,
  lookAlikeUnderCursor,
  renderScreen,
  type CellInput,
  type CellWidth,
  type ScreenGrid,
} from './decoder';
import { fingerprint } from './fingerprint';
import { analyzeScreen } from './semantics';

/** A form with empty "____" fields, as many real DOS apps draw them. */
function form(): CellInput[][] {
  const cells: CellInput[][] = Array.from({ length: 25 }, () =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: 1 })),
  );
  const put = (r: number, c: number, s: string, fg = 15, bg = 1) =>
    [...s].forEach((ch, k) => (cells[r]![c + k] = { code: ch.charCodeAt(0), fg, bg }));
  put(0, 0, ' '.repeat(80), 0, 7);
  put(0, 30, 'CUSTOMER ENTRY', 0, 7);
  put(5, 4, `Name: ${'_'.repeat(20)}`);
  put(7, 4, `Phone: ${'_'.repeat(11)}`);
  put(9, 4, 'Choice: ');
  put(24, 0, ' '.repeat(80), 0, 7);
  put(24, 1, 'F2=Save  Esc=Back', 0, 7);
  return cells;
}

async function read(cursor: ScreenGrid['cursor'], cellWidth: CellWidth = 8) {
  const img = renderScreen({ cellWidth, cellHeight: 16, cells: form(), cursor });
  const grid = decodeScreen(img.rgba, img.width, img.height);
  return { grid, text: gridText(grid), fp: await fingerprint(analyzeScreen(grid)) };
}

describe('the blinking cursor on a "____" field', () => {
  it('reads the same text and fingerprint with the cursor on any cell of the field, or off', async () => {
    for (const width of [8, 9] as const) {
      const off = await read(null, width);
      for (const [row, from, length] of [
        [5, 10, 20],
        [7, 11, 11],
      ] as const)
        for (let col = from; col < from + length; col++) {
          const on = await read({ row, col }, width);
          expect(on.grid.cursor).toEqual({ row, col });
          expect(on.text, `${width} px cells, cursor at ${row},${col}`).toEqual(off.text);
          expect(on.fp, `${width} px cells, cursor at ${row},${col}`).toBe(off.fp);
        }
    }
  });

  it('a blank under the cursor with no "_" beside it stays a blank', async () => {
    const on = await read({ row: 9, col: 12 });
    expect(on.grid.cursor).toEqual({ row: 9, col: 12 });
    expect(on.text[9]!.slice(4, 14)).toBe('Choice:   ');
  });
});

describe('lookAlikeUnderCursor', () => {
  it('pairs only the characters the cursor makes identical', () => {
    expect(lookAlikeUnderCursor(' ', '_')).toBe(true);
    expect(lookAlikeUnderCursor('g', 'q')).toBe(true);
    expect(lookAlikeUnderCursor('A', 'A')).toBe(true);
    expect(lookAlikeUnderCursor('a', 'b')).toBe(false);
    expect(lookAlikeUnderCursor('_', 'P')).toBe(false);
    expect(lookAlikeUnderCursor(String.fromCharCode(0xfffd), ' ')).toBe(false);
  });
});
