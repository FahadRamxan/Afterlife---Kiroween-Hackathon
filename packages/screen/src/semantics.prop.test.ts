import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeScreen, gridFromCells, renderScreen } from './decoder';
import { ScreenModelSchema, analyzeScreen } from './semantics';
import { scrCells } from './test-screens';

const SCREENS = [
  'shifa/menu/MENU',
  'shifa/bill-small/LINES',
  'shifa/stock/STOCK1',
  'iqra/menu/MENU2',
  'barkat/sale-ok/CONFIRM',
  'barkat/ledger/LEDGER',
].map(scrCells);

// A sample screen with some cells changed to other letters, digits and spaces, in their colours.
const screen = fc
  .tuple(
    fc.integer({ min: 0, max: SCREENS.length - 1 }),
    fc.array(
      fc.tuple(
        fc.integer({ min: 0, max: 24 }),
        fc.integer({ min: 0, max: 79 }),
        fc.constantFrom(...' ABCXYZ0123456789:._-'),
      ),
      { maxLength: 12 },
    ),
    fc.option(
      fc.record({ row: fc.integer({ min: 0, max: 24 }), col: fc.integer({ min: 0, max: 79 }) }),
      {
        nil: null,
      },
    ),
  )
  .map(([i, edits, cursor]) => {
    const cells = SCREENS[i]!.map((line) => line.map((c) => ({ ...c })));
    for (const [r, c, ch] of edits) cells[r]![c]!.code = ch.charCodeAt(0);
    return { cells, cursor };
  });

describe('analyzeScreen properties', () => {
  it(
    're-rendering a screen and decoding it again gives the same model',
    () => {
      fc.assert(
        fc.property(screen, ({ cells, cursor }) => {
          const grid = gridFromCells(cells, { cursor });
          const img = renderScreen({ cellWidth: 8, cellHeight: 16, cells, cursor });
          const again = decodeScreen(img.rgba, img.width, img.height);
          expect(analyzeScreen(again)).toEqual(analyzeScreen(grid));
        }),
      );
    },
    // Rendering and decoding a full 640x400 frame per run: about 10 ms.
    120_000,
  );

  it('always gives a valid model that stays on the screen', () => {
    fc.assert(
      fc.property(screen, ({ cells, cursor }) => {
        const m = analyzeScreen(gridFromCells(cells, { cursor }));
        expect(ScreenModelSchema.safeParse(m).success).toBe(true);
        for (const f of m.fields) {
          expect(f.col).toBeGreaterThanOrEqual(0);
          expect(f.col + (f.length ?? 1)).toBeLessThanOrEqual(80);
        }
      }),
    );
  });
});
