import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { gridFromCells, type CellInput } from './decoder';
import { layoutKey } from './fingerprint';
import { analyzeScreen } from './semantics';
import { scrCells } from './test-screens';

// Screens with typed-in values, shown values, numbers, a clock and menus.
const SCREENS = [
  'shifa/menu/MENU',
  'shifa/bill-small/LINES',
  'shifa/stock/STOCK1',
  'iqra/menu/MENU2',
  'iqra/students/STU1',
  'barkat/menu/MENU',
  'barkat/sale-ok/CONFIRM',
  'barkat/ledger/LEDGER',
].map((path) => {
  const cells = scrCells(path);
  return { path, cells, model: analyzeScreen(gridFromCells(cells)) };
});

const keyOf = (cells: CellInput[][]) => layoutKey(analyzeScreen(gridFromCells(cells)));
const copy = (cells: CellInput[][]) => cells.map((l) => l.map((c) => ({ ...c })));
const write = (cells: CellInput[][], row: number, col: number, s: string) => {
  for (let k = 0; k < s.length; k++) cells[row]![col + k]!.code = s.charCodeAt(k);
};

const screen = fc.integer({ min: 0, max: SCREENS.length - 1 }).map((i) => SCREENS[i]!);
const word = fc
  .array(fc.constantFrom(...'ABCDEFGHJKMNPRSTVWXYZ0123456789'), { minLength: 1, maxLength: 12 })
  .map((a) => a.join(''));

// Each run analyses a whole screen: 2000 runs take a few seconds, more while every project's tests
// run at once (ci:local timed out at the 5 s default).
describe('layoutKey properties (the fingerprint hashes it)', { timeout: 60_000 }, () => {
  it('changing only the values typed into fields keeps it', () => {
    fc.assert(
      fc.property(screen, fc.array(word, { minLength: 4, maxLength: 4 }), (s, words) => {
        const boxes = s.model.fields.filter((f) => f.kind === 'reverse');
        fc.pre(boxes.length > 0);
        const cells = copy(s.cells);
        boxes.forEach((f, k) => {
          const w = words[k % words.length]!.slice(0, f.length!);
          write(cells, f.row, f.col, ' '.repeat(f.length!));
          write(cells, f.row, f.col, w);
        });
        expect(keyOf(cells)).toBe(layoutKey(s.model));
      }),
    );
  });

  it('changing the numbers on the screen (clock, totals, counts) keeps it', () => {
    fc.assert(
      fc.property(
        screen,
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1 }),
        (s, digits) => {
          // Digits in menu items and the status bar are keys (1  New Bill, 1-5 Select, F2), not numbers.
          const menuRows = new Set(s.model.menu?.items.map((i) => i.row));
          if (s.model.status) menuRows.add(s.model.status.row);
          const cells = copy(s.cells);
          let k = 0;
          cells.forEach((line, r) => {
            if (menuRows.has(r)) return;
            for (const c of line)
              if (c.code >= 0x30 && c.code <= 0x39) c.code = 0x30 + digits[k++ % digits.length]!;
          });
          expect(keyOf(cells)).toBe(layoutKey(s.model));
        },
      ),
    );
  });

  it('changing a label, a menu item or the screen name changes it', () => {
    const named = SCREENS.flatMap((s) => [
      ...s.model.fields.filter((f) => f.label).map((f) => ({ s, row: f.row, text: f.label! })),
      ...(s.model.menu?.items ?? []).map((i) => ({ s, row: i.row, text: i.label })),
      ...(s.model.title ? [{ s, row: 0, text: s.model.title.name }] : []),
    ]);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: named.length - 1 }),
        fc.nat(),
        fc.constantFrom(...'QZXJKV'),
        (i, at, letter) => {
          const { s, row, text } = named[i]!;
          const letters = [...text].flatMap((ch, k) => (/[A-Za-z]/.test(ch) ? [k] : []));
          fc.pre(letters.length > 0);
          const k = letters[at % letters.length]!;
          const replacement = /[a-z]/.test(text[k]!) ? letter.toLowerCase() : letter;
          fc.pre(replacement !== text[k]);
          const col =
            s.cells[row]!.map((c) => String.fromCharCode(c.code))
              .join('')
              .indexOf(text) + k;
          const cells = copy(s.cells);
          cells[row]![col]!.code = replacement.charCodeAt(0);
          expect(keyOf(cells)).not.toBe(layoutKey(s.model));
        },
      ),
    );
  });

  it('the values shown after a label can change too', () => {
    const shown = SCREENS.flatMap((s) => s.model.labels.map((l) => ({ s, l })));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: shown.length - 1 }), word, (i, w) => {
        const { s, l } = shown[i]!;
        const line = s.cells[l.row]!.map((c) => String.fromCharCode(c.code)).join('');
        const start = line.indexOf(l.value, l.col);
        const cells = copy(s.cells);
        write(cells, l.row, start, ' '.repeat(l.value.length));
        write(cells, l.row, start, w.slice(0, Math.max(1, l.value.length)));
        expect(keyOf(cells)).toBe(layoutKey(s.model));
      }),
    );
  });
});
