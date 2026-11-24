import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeScreen, gridFromCells } from './decoder';
import { decodePng } from './png';
import { scrCells } from './test-screens';
import { ScreenRefineError, analyzeScreen, refineScreen, type ScreenModel } from './semantics';

const model = (path: string) => analyzeScreen(gridFromCells(scrCells(path)));
const snapshot = (m: ScreenModel, name: string) =>
  expect(JSON.stringify(m, null, 2) + '\n').toMatchFileSnapshot(`./__screens__/${name}.json`);

describe('analyzeScreen on the sample apps (10 screens, plus a live frame)', () => {
  it('Shifa main menu: title bar, numbered menu, the Choice prompt and the hints', async () => {
    const m = model('shifa/menu/MENU');
    expect(m.title).toMatchObject({
      name: 'MAIN MENU',
      parts: ['SHIFA MEDICAL STORE', 'v2.3', 'MAIN MENU', '15/07/98'],
    });
    expect(m.menu?.kind).toBe('numbered');
    expect(m.menu?.items.map((i) => [i.key, i.label])).toEqual([
      ['1', 'New Bill'],
      ['2', 'Stock'],
      ['3', 'Customers'],
      ['4', 'Daily Report'],
      ['5', 'Exit'],
    ]);
    expect(m.fields).toEqual([
      {
        kind: 'prompt',
        label: 'Choice',
        row: 18,
        col: 40,
        length: null,
        value: '',
        focused: false,
      },
    ]);
    expect(m.status?.hints).toEqual([{ key: '1-5', action: 'Select' }]);
    expect(m.texts.map((t) => t.text)).toContain('Satellite Town, Rawalpindi');
    await snapshot(m, 'shifa-menu');
  });

  it('Shifa new bill: a label, the lines table, the Code box and the Qty prompt', async () => {
    const m = model('shifa/bill-small/LINES');
    expect(m.labels).toEqual([{ label: 'Customer', value: 'WALK-IN', row: 2, col: 1 }]);
    expect(m.tables).toHaveLength(1);
    const t = m.tables[0]!;
    expect(t.columns.map((c) => c.name)).toEqual([
      '#',
      'CODE',
      'NAME',
      'BATCH',
      'PRICE',
      'QTY',
      'AMOUNT',
    ]);
    expect(t.columns.map((c) => c.align)).toEqual([
      'right',
      'left',
      'left',
      'left',
      'right',
      'right',
      'right',
    ]);
    expect(t.rows.map((r) => r.cells)).toEqual([
      ['1', 'PAN500', 'PANADOL 500MG STRIP', 'B98031', '12.50', '4', '50.00'],
      ['2', 'BRU400', 'BRUFEN 400MG STRIP', 'B97112', '18.75', '2', '37.50'],
    ]);
    expect(m.fields.map((f) => [f.kind, f.label, f.col, f.length])).toEqual([
      ['reverse', 'Code', 7, 6],
      ['prompt', 'Qty', 21, null],
    ]);
    expect(m.status?.hints.map((h) => h.key)).toEqual([
      'Enter',
      'Enter on blank code',
      'F3',
      'Esc',
    ]);
    await snapshot(m, 'shifa-bill-lines');
  });

  it('Shifa expired batch: the red error line', async () => {
    const m = model('shifa/expired/EXPIRED');
    expect(m.messages).toEqual([
      { kind: 'error', text: 'BATCH S97090 EXPIRED - CANNOT SELL', row: 23, col: 2 },
    ]);
    // No lines yet: an empty table, not loose words.
    expect(m.tables.map((x) => [x.headerRow, x.columns.length, x.rows.length])).toEqual([
      [4, 7, 0],
    ]);
    expect(m.texts.map((x) => x.text)).toEqual(['SUBTOTAL', '0.00']);
    await snapshot(m, 'shifa-expired');
  });

  it('Shifa stock: a 17-row table with right-aligned numbers, notes are not a column', async () => {
    const m = model('shifa/stock/STOCK1');
    const t = m.tables[0]!;
    expect(t.columns.map((c) => [c.name, c.align])).toEqual([
      ['CODE', 'left'],
      ['NAME', 'left'],
      ['BATCH', 'left'],
      ['EXPIRY', 'left'],
      ['PRICE', 'right'],
      ['QTY', 'right'],
    ]);
    expect(t.rows).toHaveLength(17);
    expect(t.rows[2]!.cells).toEqual([
      'AUG625',
      'AUGMENTIN 625MG',
      'A98020',
      '31/03/99',
      '165.00',
      '60',
    ]);
    expect(m.texts.filter((x) => x.text === 'EXPIRED')).toHaveLength(2);
    await snapshot(m, 'shifa-stock');
  });

  it('Shifa customers: a table and the NAME REQUIRED error', async () => {
    const m = model('shifa/customers/NONAME');
    expect(m.tables[0]!.columns.map((c) => c.name)).toEqual(['ID', 'NAME', 'PHONE']);
    expect(m.tables[0]!.rows).toHaveLength(8);
    expect(m.messages).toEqual([{ kind: 'error', text: 'NAME REQUIRED', row: 23, col: 2 }]);
    expect(m.status?.hints).toEqual([
      { key: 'A', action: 'Add customer' },
      { key: 'PgDn/PgUp', action: 'Page' },
      { key: 'Esc', action: 'Back' },
    ]);
    await snapshot(m, 'shifa-customers-noname');
  });

  it('Iqra main menu: a bar menu with Students highlighted', async () => {
    const m = model('iqra/menu/MENU2');
    expect(m.menu?.kind).toBe('bar');
    expect(m.menu?.items.map((i) => [i.label, i.selected])).toEqual([
      ['Collect Fee', false],
      ['Students', true],
      ['Fee Schedule', false],
      ["Today's Receipts", false],
      ['Exit', false],
    ]);
    expect(m.fields).toEqual([]);
    expect(m.title?.name).toBe('MAIN MENU');
    await snapshot(m, 'iqra-menu');
  });

  it('Iqra students: six columns, the class and child numbers right-aligned', async () => {
    const t = model('iqra/students/STU1').tables[0]!;
    expect(t.columns.map((c) => [c.name, c.align])).toEqual([
      ['ID', 'left'],
      ['NAME', 'left'],
      ['FATHER', 'left'],
      ['CLASS', 'right'],
      ['FAMILY', 'left'],
      ['CHILD', 'right'],
    ]);
    expect(t.rows[2]!.cells).toEqual(['S0003', 'FATIMA', 'TARIQ MAHMOOD', '10', 'F002', '1']);
    await snapshot(model('iqra/students/STU1'), 'iqra-students');
  });

  it('a menu written "1. Item", "2) Item" or "A. Item", the commonest DOS style (review 61-80, a blind test)', () => {
    // An app Afterlife was never shown (a 1999 weighbridge): its menu was not seen as one, so the
    // Possessor typed into "Your choice" and stopped after one action.
    const cells = (lines: string[]) =>
      Array.from({ length: 25 }, (_, r) =>
        [...(lines[r] ?? '').padEnd(80).slice(0, 80)].map((ch) => ({
          code: ch.charCodeAt(0),
          fg: 15,
          bg: 1,
        })),
      );
    const lines = [
      ' MADINA COMPUTER KANTA  v1.2        MAIN MENU                          19/10/99',
      '',
      '',
      '',
      '                        1. Weigh Vehicle (New Slip)',
      '                        2. Parties',
      '                        3. Item Rates',
      "                        4. Today's Slips",
      '                        0. Exit',
      '',
      '',
      '                        Your choice:',
    ];
    const m = analyzeScreen(gridFromCells(cells(lines)));
    expect(m.menu?.kind).toBe('numbered');
    expect(m.menu?.items.map((i) => [i.key, i.label])).toEqual([
      ['1', 'Weigh Vehicle (New Slip)'],
      ['2', 'Parties'],
      ['3', 'Item Rates'],
      ['4', "Today's Slips"],
      ['0', 'Exit'],
    ]);
    const paren = analyzeScreen(gridFromCells(cells(lines.map((l) => l.replace(/(\d)\./, '$1)')))));
    expect(paren.menu?.items.map((i) => i.key)).toEqual(['1', '2', '3', '4', '0']);
    const letters = analyzeScreen(
      gridFromCells(
        cells(['', '   A. Add party', '   C. Change rate', '   X. Exit', '', '   Choice:']),
      ),
    );
    expect(letters.menu?.kind).toBe('lettered');
    expect(letters.menu?.items.map((i) => [i.key, i.label])).toEqual([
      ['A', 'Add party'],
      ['C', 'Change rate'],
      ['X', 'Exit'],
    ]);
    // Not a menu: prices and dates that start with digits.
    const prices = analyzeScreen(
      gridFromCells(cells(['', '   12.50 per strip', '   19/10/99 opened', '   10.5 kg'])),
    );
    expect(prices.menu).toBeNull();
  });

  it('Barkat main menu: lettered items', async () => {
    const m = model('barkat/menu/MENU');
    expect(m.menu?.kind).toBe('lettered');
    expect(m.menu?.items.map((i) => i.key)).toEqual(['S', 'P', 'L', 'B', 'R', 'X']);
    expect(m.menu?.items[0]!.label).toBe('Sale on credit (udhaar)');
    await snapshot(m, 'barkat-menu');
  });

  it('Barkat sale: input boxes with their labels, shown values, and the Y/N question', async () => {
    const m = model('barkat/sale-ok/CONFIRM');
    expect(m.fields.map((f) => [f.label, f.value, f.length])).toEqual([
      ['Party ID', 'P003', 4],
      ['Amount Rs', '450', 9],
      ['Note', 'ATTA 20 KG', 20],
    ]);
    expect(m.labels.map((l) => [l.label, l.value])).toEqual([
      ['Name', 'BAJI SHAMIM'],
      ['Area', 'DHOKE RATTA'],
      ['Limit', '20000.00'],
      ['Balance', '5340.00'],
    ]);
    expect(m.messages).toEqual([
      { kind: 'info', text: 'SAVE SALE OF RS 450.00 FOR P003? (Y/N)', row: 23, col: 2 },
    ]);
    await snapshot(m, 'barkat-sale-confirm');
  });

  it('Barkat ledger: the party ledger table', async () => {
    const m = model('barkat/ledger/LEDGER');
    const t = m.tables[0]!;
    expect(t.columns.map((c) => [c.name, c.align])).toEqual([
      ['DATE', 'left'],
      ['KIND', 'left'],
      ['AMOUNT', 'right'],
      ['BALANCE', 'right'],
      ['NOTE', 'left'],
    ]);
    expect(t.rows).toHaveLength(5);
    expect(t.rows.at(-1)!.cells).toEqual([
      '14/11/96',
      'SALE',
      '2000.00',
      '5340.00',
      'CHAWAL BASMATI',
    ]);
    await snapshot(m, 'barkat-ledger');
  });

  it('a live js-dos frame: the cursor sits in the Choice prompt, so it is focused', async () => {
    const img = decodePng(
      new Uint8Array(readFileSync(resolve(__dirname, '../fixtures/shifa-menu-menu-640.png'))),
    );
    const grid = decodeScreen(img.rgba, img.width, img.height);
    const m = analyzeScreen(grid);
    expect(m.cursor).toEqual(grid.cursor);
    if (grid.cursor) expect(m.fields[0]).toMatchObject({ label: 'Choice', focused: true });
    // Apart from the cursor, the live frame reads the same as DOSBox's own dump.
    const dump = model('shifa/menu/MENU');
    expect({ ...m, cursor: null, fields: m.fields.map((f) => ({ ...f, focused: false })) }).toEqual(
      dump,
    );
  });
});

describe('refineScreen (the LLM hook)', () => {
  const grid = gridFromCells(scrCells('shifa/menu/MENU'));
  const draft = analyzeScreen(grid);

  it('accepts a valid refinement', async () => {
    const better = { ...draft, title: { ...draft.title!, name: 'Main menu' } };
    expect((await refineScreen(grid, draft, () => better)).title?.name).toBe('Main menu');
  });

  it('refuses an answer that is not a screen model', async () => {
    await expect(refineScreen(grid, draft, () => ({ menu: 'yes' }))).rejects.toThrow(
      ScreenRefineError,
    );
  });

  it('refuses positions off the screen', async () => {
    const off = { ...draft, texts: [{ text: 'x', row: 30, col: 2, highlight: false }] };
    await expect(refineScreen(grid, draft, async () => off)).rejects.toThrow(/off the screen/);
  });
});
