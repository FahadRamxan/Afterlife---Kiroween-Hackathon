import type { ScreenCell } from '@afterlife/screen';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { crtRuns, crtSummary, dosColour } from './crt-screen';

const cell = (char: string, fg: number, bg: number): ScreenCell => ({
  code: char.charCodeAt(0),
  char,
  fg,
  bg,
});

describe('crtRuns (one span per stretch of the same colours)', () => {
  it('splits a row where the colours change', () => {
    const row = [...'Code: ']
      .map((c) => cell(c, 15, 1))
      .concat([...'      '].map((c) => cell(c, 0, 7)));
    expect(crtRuns(row)).toEqual([
      { col: 0, text: 'Code: ', fg: 15, bg: 1 },
      { col: 6, text: '      ', fg: 0, bg: 7 },
    ]);
  });

  it('a blank cell joins its neighbours when the background is the same', () => {
    // Blanks have no visible foreground, so " A B" in white is one run, not four.
    const row = [cell(' ', 1, 1), cell('A', 15, 1), cell(' ', 1, 1), cell('B', 15, 1)];
    expect(crtRuns(row)).toEqual([{ col: 0, text: ' A B', fg: 15, bg: 1 }]);
  });

  it('property: the runs spell the row, in order, each in one colour', () => {
    const anyCell = fc
      .tuple(
        fc.constantFrom(...' AB:1'),
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
      )
      .map(([c, fg, bg]) => cell(c, c === ' ' ? bg : fg, bg));
    fc.assert(
      fc.property(fc.array(anyCell, { minLength: 1, maxLength: 80 }), (row) => {
        const runs = crtRuns(row);
        expect(runs.map((r) => r.text).join('')).toBe(row.map((c) => c.char).join(''));
        let col = 0;
        for (const r of runs) {
          expect(r.col).toBe(col);
          for (const [k, ch] of [...r.text].entries()) {
            const c = row[col + k]!;
            expect(c.bg).toBe(r.bg);
            if (ch !== ' ') expect(c.fg).toBe(r.fg);
          }
          col += r.text.length;
        }
      }),
    );
  });
});

describe('dosColour', () => {
  it('is the VGA colour as CSS', () => {
    expect(dosColour(1)).toBe('rgb(0 0 170)');
    expect(dosColour(14)).toBe('rgb(255 255 85)');
  });
});

describe('crtSummary (what the overlays mean, in words)', () => {
  it('names the highlighted field, the changed data and where the agent types', () => {
    expect(
      crtSummary({
        highlight: { row: 21, col: 7, length: 6, label: 'Code' },
        changed: [{ row: 6, col: 1, length: 66 }],
        ghost: { row: 21, col: 7 },
        cursor: { row: 21, col: 7 },
      }),
    ).toBe(
      'Field Code is highlighted. Data changed on row 7. The agent is typing at row 22, column 8. The DOS cursor is at row 22, column 8.',
    );
  });

  it('is empty without overlays', () => {
    expect(crtSummary({})).toBe('');
  });
});
