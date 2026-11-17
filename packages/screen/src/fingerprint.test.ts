import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeScreen, gridFromCells } from './decoder';
import { fingerprint, layoutKey } from './fingerprint';
import { decodePng } from './png';
import { analyzeScreen } from './semantics';
import { scrCells } from './test-screens';

const FIXTURES = resolve(__dirname, '../fixtures');
type Capture = { app: string; scr: string; png: string };
const captures: Capture[] = JSON.parse(readFileSync(resolve(FIXTURES, 'captures.json'), 'utf8'));

const fromDump = (path: string) => fingerprint(analyzeScreen(gridFromCells(scrCells(path))));
const fromFrame = (png: string) => {
  const img = decodePng(new Uint8Array(readFileSync(resolve(FIXTURES, png))));
  return fingerprint(analyzeScreen(decodeScreen(img.rgba, img.width, img.height)));
};

describe('fingerprint', () => {
  it('is a short, stable id', async () => {
    const fp = await fromDump('shifa/menu/MENU');
    expect(fp).toMatch(/^fp_[0-9a-f]{16}$/);
    expect(await fromDump('shifa/menu/MENU')).toBe(fp);
  });

  it.each(captures.map((c) => [c.png, c] as const))(
    'the same screen in two runs (DOSBox dump and js-dos frame %s) has the same fingerprint',
    async (_png, c) => {
      expect(await fromFrame(c.png)).toBe(await fromDump(`${c.app}/${c.scr}`));
    },
  );

  it('one screen in different states is still one screen', async () => {
    // Stock pages: other rows, other page number.
    const stock = await Promise.all(
      ['STOCK1', 'STOCK2', 'STOCK3'].map((p) => fromDump(`shifa/stock/${p}`)),
    );
    expect(new Set(stock).size).toBe(1);
    // The Iqra menu with a different item selected.
    expect(await fromDump('iqra/menu/MENU2')).toBe(await fromDump('iqra/menu/MENU'));
    // Entering bill lines: none yet, with an error line, or with two lines.
    const lines = await Promise.all(
      ['expired/EXPIRED', 'expired/EXPIRED2', 'bill-small/LINES'].map((p) =>
        fromDump(`shifa/${p}`),
      ),
    );
    expect(new Set(lines).size).toBe(1);
    // The totals stage (F2 saves) is its own screen, before and after saving.
    expect(await fromDump('shifa/bill-small/SAVED')).toBe(
      await fromDump('shifa/bill-small/TOTALS'),
    );
    // Barkat's ledger for one party or another.
    expect(await fromDump('barkat/overflow/LEDGER')).toBe(await fromDump('barkat/ledger/LEDGER'));
  });

  it('different screens have different fingerprints', async () => {
    const screens = [
      'shifa/menu/MENU',
      'shifa/stock/STOCK1',
      'shifa/customers/CUSTS',
      'shifa/bill-small/LINES',
      'shifa/bill-small/TOTALS',
      'shifa/daily-report/REPORT',
      'iqra/menu/MENU',
      'iqra/students/STU1',
      'iqra/schedule/SCHEDULE',
      'barkat/menu/MENU',
      'barkat/ledger/LEDGER',
      'barkat/balances/BAL1',
      'barkat/reminders/REM1',
    ];
    const fps = await Promise.all(screens.map(fromDump));
    expect(new Set(fps).size).toBe(screens.length);
  });

  it('the layout key leaves out values, the clock and the selection', () => {
    const key = layoutKey(analyzeScreen(gridFromCells(scrCells('barkat/sale-ok/CONFIRM'))));
    expect(key).toContain('Party ID');
    expect(key).toContain('Amount Rs');
    for (const value of ['P003', 'BAJI SHAMIM', '450', '20/11/96', '5340.00'])
      expect(key, value).not.toContain(value);
  });
});
