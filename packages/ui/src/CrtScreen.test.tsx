import { gridFromCells, type CellInput } from '@afterlife/screen';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrtScreen } from './CrtScreen';

function screen(): CellInput[][] {
  const cells = Array.from({ length: 25 }, () =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: 1 })),
  );
  const put = (row: number, col: number, s: string, fg = 15, bg = 1) =>
    [...s].forEach((ch, k) => (cells[row]![col + k] = { code: ch.charCodeAt(0), fg, bg }));
  for (let c = 0; c < 80; c++) cells[0]![c] = { code: 0x20, fg: 15, bg: 3 };
  put(0, 1, 'SHIFA MEDICAL STORE', 15, 3);
  put(5, 1, '1 PAN500 PANADOL 500MG STRIP');
  put(21, 1, 'Code:');
  put(21, 7, '      ', 0, 7);
  return cells;
}

const grid = gridFromCells(screen(), { cursor: { row: 21, col: 7 } });

describe('CrtScreen', () => {
  const out = renderToStaticMarkup(
    <CrtScreen
      grid={grid}
      label="Shifa Medical Store, 1998, recorded run"
      highlight={{ row: 21, col: 7, length: 6, label: 'Code' }}
      ghost={{ row: 21, col: 7 }}
      changed={[{ row: 5, col: 1, length: 28 }]}
    />,
  );

  it('frames the old app in a CRT, named for screen readers', () => {
    expect(out).toContain('aria-label="Shifa Medical Store, 1998, recorded run"');
    expect(out).toContain('crt-scanlines');
  });

  it('renders all 25 rows of text in the DOS colours', () => {
    expect(out.match(/data-crt-row=/g)).toHaveLength(25);
    expect(out).toContain('PANADOL 500MG STRIP');
    expect(out).toMatch(
      /color:rgb\(255 255 255\);background-color:rgb\(0 170 170\)">[^<]*SHIFA MEDICAL STORE/,
    );
  });

  it('draws the overlays where they belong, sized in character cells', () => {
    expect(out).toMatch(
      /data-crt-highlight="true"[^>]*left:7ch;top:calc\(21 \* var\(--cell-h\)\);width:6ch/,
    );
    expect(out).toMatch(/data-pulse[^>]*left:1ch;top:calc\(5 \* var\(--cell-h\)\);width:28ch/);
    expect(out).toContain('ghost-cursor');
    expect(out).toContain('data-crt-cursor="true"');
  });

  it('says what the overlays mean in text, not only in colour', () => {
    expect(out).toContain(
      'Field Code is highlighted. Data changed on row 6. The agent is typing at row 22, column 8.',
    );
  });

  it('overlays are decorative for screen readers', () => {
    for (const m of out.matchAll(/<span[^>]*data-crt-(highlight|cursor)="true"[^>]*>/g))
      expect(m[0]).toContain('aria-hidden="true"');
  });

  it('keeps the screen left to right and every row one cell tall', () => {
    expect(out).toContain('dir="ltr"');
    expect(out).toContain('--cell-h:round(down, 1.25em, 1px)');
  });
});
