// Test helper (not shipped): DOSBox memory dumps from samples/graveyard/fixtures as cells.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CellInput } from './decoder';

const GRAVEYARD = resolve(__dirname, '../../../samples/graveyard/fixtures');

/** A .SCR dump (25 lines of CP437 bytes, "--ATTR--", 25 lines of hex attributes) as cells. */
export function scrCells(path: string): CellInput[][] {
  const lines = readFileSync(resolve(GRAVEYARD, `${path}.SCR`), 'latin1').split(/\r?\n/);
  const sep = lines.indexOf('--ATTR--');
  return Array.from({ length: 25 }, (_, row) =>
    Array.from({ length: 80 }, (_, col) => {
      const attr = parseInt(lines[sep + 1 + row]!.slice(col * 2, col * 2 + 2), 16);
      return { code: lines[row]!.charCodeAt(col), fg: attr & 15, bg: attr >> 4 };
    }),
  );
}
