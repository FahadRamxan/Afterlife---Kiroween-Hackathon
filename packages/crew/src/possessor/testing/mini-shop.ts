// Test helper (not shipped): a tiny DOS shop on the FakeEmulator, drawn in Shifa's colours
// (samples/graveyard/toolchain/lib/ui.h) so the real screen decoder and ScreenModel read it as
// they read Shifa. It has a menu (New Sale, Items, Exit), a sale (code, quantity, totals, F2 to
// save) and an item list. Saving a sale writes SALES.DBF and takes the quantity off ITEMS.DBF.
// The Possessor's unit tests explore it in milliseconds; the real Shifa test is the integration
// test.
import { readDbf, writeDbf, type DbfRecord } from '@afterlife/dbf';
import { FakeEmulator, buildBundle, type FakeApp, type KeyStroke } from '@afterlife/emulator';
import { renderScreen, unicodeToCp437, type CellInput } from '@afterlife/screen';

const BODY = 0x1f;
const TITLE = 0x3f;
const HILITE = 0x1e;
const FIELD = 0x70;
const ERROR = 0x4f;
const HINT = 0x30;

type Put = [row: number, col: number, attr: number, text: string];

function draw(
  title: string,
  puts: Put[],
  hint: string,
  cursor: { row: number; col: number } | null,
) {
  const cells: CellInput[][] = Array.from({ length: 25 }, () =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: BODY & 15, bg: BODY >> 4 })),
  );
  const put = (row: number, col: number, attr: number, text: string) => {
    const codes = unicodeToCp437(text);
    codes.forEach((code, i) => {
      if (col + i < 80) cells[row]![col + i] = { code, fg: attr & 15, bg: attr >> 4 };
    });
  };
  put(0, 0, TITLE, ' '.repeat(80));
  put(0, 1, TITLE, 'MINI SHOP  v1.0');
  put(0, Math.floor((80 - title.length) / 2), TITLE, title);
  put(0, 71, TITLE, '15/07/98');
  put(24, 0, HINT, ' '.repeat(80));
  put(24, 1, HINT, hint);
  for (const p of puts) put(...p);
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells, cursor });
}

const ITEMS = [
  { CODE: 'TEA100', NAME: 'TAPAL TEA 100G', PRICE: '120.00', QTY: '50' },
  { CODE: 'SUG001', NAME: 'SUGAR 1KG', PRICE: '95.00', QTY: '30' },
  { CODE: 'RIC005', NAME: 'BASMATI RICE 5KG', PRICE: '890.00', QTY: '8' },
];

function itemsDbf(rows: typeof ITEMS) {
  return writeDbf({
    fields: [
      { name: 'CODE', type: 'C', length: 6, decimals: 0 },
      { name: 'NAME', type: 'C', length: 20, decimals: 0 },
      { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
      { name: 'QTY', type: 'N', length: 5, decimals: 0 },
    ],
    records: rows.map((values): DbfRecord => ({ deleted: false, values })),
  });
}

function salesDbf(rows: { NO: string; TOTAL: string }[]) {
  return writeDbf({
    fields: [
      { name: 'NO', type: 'C', length: 4, decimals: 0 },
      { name: 'TOTAL', type: 'N', length: 10, decimals: 2 },
    ],
    records: rows.map((values): DbfRecord => ({ deleted: false, values })),
  });
}

export function miniShopBundle(): Uint8Array {
  return buildBundle({
    executable: 'SHOP.EXE',
    files: {
      'SHOP.EXE': new Uint8Array([0x4d, 0x5a]),
      'ITEMS.DBF': itemsDbf(ITEMS),
      'SALES.DBF': salesDbf([]),
    },
  });
}

type State =
  | { at: 'menu' }
  | { at: 'items' }
  | { at: 'code'; lines: { code: string; qty: number }[]; typing: string; error: string }
  | { at: 'qty'; lines: { code: string; qty: number }[]; code: string; typing: string }
  | { at: 'totals'; lines: { code: string; qty: number }[]; saved: string }
  | { at: 'exited' };

const money = (paisa: number) => (paisa / 100).toFixed(2);

/** The app: a state machine that redraws after every key. `state` is exposed for the tests. */
export function miniShopApp(): FakeApp & { state: () => State } {
  let s: State = { at: 'menu' };
  const price = (code: string) =>
    Math.round(Number(ITEMS.find((i) => i.CODE === code)!.PRICE) * 100);
  const screen = () => {
    switch (s.at) {
      case 'menu':
        return draw(
          'MAIN MENU',
          [
            [9, 32, BODY, '1  New Sale'],
            [10, 32, BODY, '2  Items'],
            [11, 32, BODY, '3  Exit'],
            [18, 32, BODY, 'Choice:'],
          ],
          '1-3 Select',
          { row: 18, col: 40 },
        );
      case 'items':
        return draw(
          'ITEMS',
          [
            [3, 1, BODY, 'CODE   NAME                 PRICE    QTY'],
            ...ITEMS.map((i, n): Put => [
              4 + n,
              1,
              BODY,
              `${i.CODE} ${i.NAME.padEnd(20)} ${i.PRICE.padStart(6)} ${i.QTY.padStart(6)}`,
            ]),
          ],
          'Esc=Back',
          null,
        );
      case 'code':
      case 'qty': {
        const rows: Put[] = s.lines.map((l, n) => [
          5 + n,
          1,
          BODY,
          `${String(n + 1).padStart(2)} ${l.code} ${String(l.qty).padStart(4)} ${money(price(l.code) * l.qty).padStart(10)}`,
        ]);
        const qty = s.at === 'qty';
        return draw(
          'NEW SALE',
          [
            [4, 1, BODY, ' # CODE    QTY     AMOUNT'],
            ...rows,
            [21, 1, BODY, 'Code:'],
            [21, 7, FIELD, (s.at === 'qty' ? s.code : s.typing).padEnd(6)],
            [21, 16, BODY, 'Qty:'],
            ...(qty ? [[21, 21, FIELD, s.typing.padEnd(4)] as Put] : []),
            ...(s.at === 'code' && s.error ? [[23, 1, ERROR, ` ${s.error} `] as Put] : []),
          ],
          'Enter=Add  Enter on blank code=Finish  Esc=Cancel',
          qty ? { row: 21, col: 21 + s.typing.length } : { row: 21, col: 7 + s.typing.length },
        );
      }
      case 'totals': {
        const sub = s.lines.reduce((n, l) => n + price(l.code) * l.qty, 0);
        return draw(
          'NEW SALE',
          [
            [4, 1, BODY, ' # CODE    QTY     AMOUNT'],
            [19, 41, BODY, `SUBTOTAL ${money(sub).padStart(14)}`],
            [20, 41, HILITE, `TOTAL    ${money(sub).padStart(14)}`],
            ...(s.saved ? [[23, 2, HILITE, s.saved] as Put] : []),
          ],
          'F2=Save sale  Esc=Cancel',
          null,
        );
      }
      case 'exited':
        return draw('', [], '', null);
    }
  };

  const save = (files: Map<string, Uint8Array>, lines: { code: string; qty: number }[]) => {
    const items = readDbf(files.get('ITEMS.DBF')!).records.map(
      (r) => ({ ...r.values }) as Record<string, string>,
    );
    for (const l of lines) {
      const it = items.find((i) => i.CODE === l.code)!;
      it.QTY = String(Number(it.QTY) - l.qty);
    }
    files.set('ITEMS.DBF', itemsDbf(items as typeof ITEMS));
    const sales = readDbf(files.get('SALES.DBF')!).records.map(
      (r) => r.values as { NO: string; TOTAL: string },
    );
    const no = String(sales.length + 1).padStart(4, '0');
    const total = lines.reduce((n, l) => n + price(l.code) * l.qty, 0);
    files.set('SALES.DBF', salesDbf([...sales, { NO: no, TOTAL: money(total) }]));
    return no;
  };

  const press = (k: KeyStroke, files: Map<string, Uint8Array>) => {
    const key = k.kind === 'key' ? k.key : null;
    const chars = k.kind === 'text' ? [...k.text] : [];
    switch (s.at) {
      case 'menu':
        for (const c of chars) {
          if (c === '1') s = { at: 'code', lines: [], typing: '', error: '' };
          else if (c === '2') s = { at: 'items' };
          else if (c === '3') s = { at: 'exited' };
          if (s.at !== 'menu') return;
        }
        return;
      case 'items':
        if (key === 'Esc') s = { at: 'menu' };
        return;
      case 'code':
        if (key === 'Esc') s = { at: 'menu' };
        else if (key === 'Enter') {
          const code = s.typing.trim().toUpperCase();
          if (code === '')
            s = s.lines.length ? { at: 'totals', lines: s.lines, saved: '' } : { at: 'menu' };
          else if (!ITEMS.some((i) => i.CODE === code))
            s = { ...s, typing: '', error: 'ITEM NOT FOUND' };
          else if (s.lines.some((l) => l.code === code))
            s = { ...s, typing: '', error: 'ALREADY IN SALE' };
          else s = { at: 'qty', lines: s.lines, code, typing: '' };
        } else if (key === 'Backspace') s = { ...s, typing: s.typing.slice(0, -1) };
        else s = { ...s, typing: (s.typing + chars.join('')).slice(0, 6), error: '' };
        return;
      case 'qty':
        if (key === 'Esc') s = { at: 'code', lines: s.lines, typing: '', error: '' };
        else if (key === 'Enter') {
          const qty = Number(s.typing);
          s =
            Number.isInteger(qty) && qty > 0
              ? { at: 'code', lines: [...s.lines, { code: s.code, qty }], typing: '', error: '' }
              : { at: 'code', lines: s.lines, typing: '', error: 'BAD QUANTITY' };
        } else
          s = { ...s, typing: (s.typing + chars.filter((c) => /\d/.test(c)).join('')).slice(0, 4) };
        return;
      case 'totals':
        if (s.saved) s = { at: 'menu' };
        else if (key === 'Esc') s = { at: 'menu' };
        else if (key === 'F2')
          s = { ...s, saved: `SALE ${save(files, s.lines)} SAVED - PRESS ANY KEY` };
        return;
      case 'exited':
        return;
    }
  };

  return {
    screen: screen(),
    state: () => s,
    onKeys(keys, app) {
      for (const k of keys) press(k, app.files);
      app.setScreen(screen());
    },
  };
}

/** A booted FakeEmulator running the mini shop, and its app (to look at its state). */
export async function bootMiniShop() {
  const app = miniShopApp();
  const emu = new FakeEmulator(app);
  await emu.boot(miniShopBundle());
  return { emu, app };
}
