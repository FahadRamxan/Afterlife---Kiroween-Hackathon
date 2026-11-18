import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { gridFromCells, type CellInput, type ScreenGrid } from './decoder';
import { ScreenWireSchema, fromWire, toWire } from './wire';

const cell = fc.record({
  code: fc.integer({ min: 0, max: 255 }),
  fg: fc.integer({ min: 0, max: 15 }),
  bg: fc.integer({ min: 0, max: 15 }),
});
const grid: fc.Arbitrary<ScreenGrid> = fc
  .record({
    rows: fc.constantFrom(25, 50),
    cellWidth: fc.constantFrom(8 as const, 9 as const),
    seed: fc.array(cell, { minLength: 1, maxLength: 40 }),
    cursor: fc.option(fc.record({ row: fc.nat({ max: 24 }), col: fc.nat({ max: 79 }) }), {
      nil: null,
    }),
  })
  .map(({ rows, cellWidth, seed, cursor }) => {
    const cells: CellInput[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: 80 }, (_, c) => seed[(r * 80 + c) % seed.length]!),
    );
    return gridFromCells(cells, { cellWidth, cursor });
  });

describe('screen wire format', () => {
  it('round-trip: fromWire(toWire(grid)) is the same grid', () => {
    fc.assert(
      fc.property(grid, (g) => {
        // Compared as JSON: toEqual on 4,000 cells made 2,000 runs take over a minute.
        expect(JSON.stringify(fromWire(toWire(g)))).toBe(JSON.stringify(g));
      }),
    );
  });

  it('is small enough for a live event: 80x25 in under 9 kB of JSON', () => {
    fc.assert(
      fc.property(grid, (g) => {
        fc.pre(g.rows === 25);
        expect(JSON.stringify(toWire(g)).length).toBeLessThan(9_000);
      }),
    );
  });

  it('what goes on the wire passes its schema; a tampered row does not', () => {
    const w = toWire(fc.sample(grid, { seed: 1, numRuns: 1 })[0]!);
    expect(ScreenWireSchema.parse(w)).toEqual(w);
    expect(() => ScreenWireSchema.parse({ ...w, codes: [...w.codes.slice(1), 'zz'] })).toThrow();
    expect(() => ScreenWireSchema.parse({ ...w, attrs: w.attrs.slice(1) })).toThrow();
    expect(() => ScreenWireSchema.parse({ ...w, cursor: { row: w.rows, col: 0 } })).toThrow();
  });
});
