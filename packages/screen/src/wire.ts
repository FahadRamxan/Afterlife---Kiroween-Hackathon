// A decoded screen in a compact form for live events (Prompt 38): per row, the character codes
// and the colours as hex strings (2 hex digits a cell each). An 80x25 screen is about 8 kB.
import { z } from 'zod';
import { gridFromCells, type CellInput, type ScreenGrid } from './decoder';

const row = z.string().regex(/^[0-9a-f]{160}$/);

export const ScreenWireSchema = z
  .object({
    rows: z.union([z.literal(25), z.literal(50)]),
    cellWidth: z.union([z.literal(8), z.literal(9)]),
    /** Per row: 80 character codes (CP437), 2 hex digits each. */
    codes: z.array(row),
    /** Per row: 80 attributes, fg in the high digit and bg in the low one. */
    attrs: z.array(row),
    cursor: z
      .object({ row: z.number().int().min(0), col: z.number().int().min(0).max(79) })
      .nullable(),
  })
  .refine((w) => w.codes.length === w.rows && w.attrs.length === w.rows, {
    message: 'codes and attrs need one string per row',
  })
  .refine((w) => !w.cursor || w.cursor.row < w.rows, { message: 'The cursor is off the screen' });
export type ScreenWire = z.infer<typeof ScreenWireSchema>;

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

export function toWire(grid: ScreenGrid): ScreenWire {
  return {
    rows: grid.rows,
    cellWidth: grid.cellWidth,
    codes: grid.cells.map((r) => r.map((c) => hex2(c.code)).join('')),
    attrs: grid.cells.map((r) => r.map((c) => c.fg.toString(16) + c.bg.toString(16)).join('')),
    cursor: grid.cursor,
  };
}

export function fromWire(w: ScreenWire): ScreenGrid {
  const cells: CellInput[][] = w.codes.map((codes, r) =>
    Array.from({ length: 80 }, (_, c) => ({
      code: parseInt(codes.slice(c * 2, c * 2 + 2), 16),
      fg: parseInt(w.attrs[r]![c * 2]!, 16),
      bg: parseInt(w.attrs[r]![c * 2 + 1]!, 16),
    })),
  );
  return gridFromCells(cells, { cellWidth: w.cellWidth, cursor: w.cursor });
}
