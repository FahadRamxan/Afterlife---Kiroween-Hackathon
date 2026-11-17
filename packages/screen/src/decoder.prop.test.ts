import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalCell, decodeCell, renderCell } from './decoder';

const cell = fc.record({
  code: fc.integer({ min: 0, max: 255 }),
  fg: fc.integer({ min: 0, max: 15 }),
  bg: fc.integer({ min: 0, max: 15 }),
  width: fc.constantFrom(8 as const, 9 as const),
  height: fc.constantFrom(16 as const, 8 as const),
  cursor: fc.boolean(),
});

describe('decodeCell and renderCell', () => {
  it('round trip: a cell without the cursor reads back as its canonical form', () => {
    fc.assert(
      fc.property(cell, ({ code, fg, bg, width, height }) => {
        const got = decodeCell(renderCell(code, fg, bg, width, height, false), width, height);
        expect(got).toEqual({ cell: canonicalCell(code, fg, bg, height, width), cursor: false });
      }),
    );
  });

  it('what is read, drawn again, gives exactly the same pixels (with or without the cursor)', () => {
    fc.assert(
      fc.property(cell, ({ code, fg, bg, width, height, cursor }) => {
        const px = renderCell(code, fg, bg, width, height, cursor);
        const got = decodeCell(px, width, height);
        const again = renderCell(
          got.cell.code,
          got.cell.fg,
          got.cell.bg,
          width,
          height,
          got.cursor,
        );
        expect(again).toEqual(px);
      }),
    );
  });

  it('a visible cursor is always found', () => {
    fc.assert(
      fc.property(cell, ({ code, fg, bg, width, height }) => {
        fc.pre(fg !== bg);
        const got = decodeCell(renderCell(code, fg, bg, width, height, true), width, height);
        // Only a glyph that already fills the cursor rows hides it (the solid block, for one).
        const glyphHidesIt = renderCell(code, fg, bg, width, height, false).every(
          (v, i) => v === renderCell(code, fg, bg, width, height, true)[i],
        );
        expect(got.cursor || glyphHidesIt).toBe(true);
      }),
    );
  });
});
