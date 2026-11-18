// Prompt 28: the real Shifa EXE in js-dos v8 in headless Chromium, through the pool.
// No network: js-dos is served to the page from the js-dos package.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffSnapshots, snapshot } from '@afterlife/dbf';
import type { EmulatorController } from '@afterlife/emulator';
import { buildBundle, recordAction } from '@afterlife/emulator';
import { controllerContract } from '@afterlife/emulator/contract';
import { decodeScreen, gridText } from '@afterlife/screen';
import { chromium, type Browser } from 'playwright';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { HeadlessJsDos, HeadlessPool, openJsDosPage } from './headless-jsdos';

// Booting a real emulator takes a second or two; a bill takes a few more.
vi.setConfig({ testTimeout: 90_000 });

const ROOT = resolve(__dirname, '../../..');
const SHIFA = new Uint8Array(readFileSync(resolve(ROOT, 'apps/web/public/graveyard/shifa.jsdos')));
const DBFS = ['BILLITEM.DBF', 'BILLS.DBF', 'CUSTOMER.DBF', 'MEDICINE.DBF'];
const DOS_TIME = '1998-07-15 10:00:00';

let browser: Browser | null = null;
afterAll(async () => {
  await browser?.close();
});

const DIST = resolve(ROOT, 'samples/graveyard/dist/shifa');
const FILES = [...DBFS, 'SHIFA.EXE'];
controllerContract('HeadlessJsDos (real js-dos in Chromium)', {
  make: async () => {
    browser ??= await chromium.launch();
    return new HeadlessJsDos(await openJsDosPage(browser), { keyDelayMs: 50 });
  },
  bundle: buildBundle({
    executable: 'SHIFA.EXE',
    files: Object.fromEntries(
      FILES.map((f) => [f, new Uint8Array(readFileSync(resolve(DIST, f)))]),
    ),
  }),
  files: FILES,
});

/** Waits until the decoded screen shows `text`. */
async function waitFor(emu: EmulatorController, text: string, ms = 20_000): Promise<string> {
  const end = Date.now() + ms;
  let last = '';
  while (Date.now() < end) {
    const s = await emu.screenshot();
    last = gridText(decodeScreen(s.rgba, s.width, s.height)).join('\n');
    if (last.includes(text)) return last;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The screen never showed ${JSON.stringify(text)}. Last screen:\n${last}`);
}

async function dbfs(emu: EmulatorController) {
  return snapshot(
    Object.fromEntries(await Promise.all(DBFS.map(async (f) => [f, await emu.readFile(f)]))),
  );
}

/** New bill: walk-in customer, PAN500 x4 and BRU400 x2, then F2 to save (the bill-small scenario). */
async function saveBill(emu: EmulatorController) {
  const before = await dbfs(emu);
  await waitFor(emu, 'MAIN MENU');
  await emu.sendKeys('1');
  await waitFor(emu, 'Customer');
  await emu.sendKeys('{Enter}');
  await waitFor(emu, 'Code:');
  await emu.sendKeys('PAN500{Enter}4{Enter}');
  await waitFor(emu, 'PANADOL 500MG STRIP');
  await emu.sendKeys('BRU400{Enter}2{Enter}');
  await waitFor(emu, 'BRUFEN 400MG STRIP');
  await emu.sendKeys('{Enter}');
  await waitFor(emu, 'F2=Save bill');
  await emu.sendKeys('{F2}');
  await waitFor(emu, 'BILL 9807-0001 SAVED');
  return diffSnapshots(before, await dbfs(emu));
}

describe('HeadlessPool on the real Shifa', () => {
  it('drives a new bill to save, and the DBF diff shows exactly that bill', async () => {
    const pool = new HeadlessPool({ size: 1, cycles: 60000, keyDelayMs: 50 });
    try {
      const diff = await pool.use(SHIFA, saveBill, { dosTime: DOS_TIME });
      const bills = diff.tables['BILLS.DBF']!;
      expect(bills.inserted.map((r) => r.values)).toEqual([
        {
          BILL_NO: '9807-0001',
          BILL_DATE: '19980715',
          CUST_ID: '',
          SUBTOTAL: '87.50',
          DISCOUNT: '0.00',
          GST: '14.87',
          TOTAL: '102.37',
        },
      ]);
      expect(
        diff.tables['BILLITEM.DBF']!.inserted.map((r) => [r.values.CODE, r.values.QTY]),
      ).toEqual([
        ['PAN500', '4'],
        ['BRU400', '2'],
      ]);
      expect(
        diff.tables['MEDICINE.DBF']!.updated.map((u) => [
          u.key,
          u.changes.map((c) => [c.field, c.before, c.after, c.delta]),
        ]),
      ).toEqual([
        ['PAN500', [['QTY', '240', '236', '-4']]],
        ['BRU400', [['QTY', '180', '178', '-2']]],
      ]);
      expect(diff.unchanged).toEqual(['CUSTOMER.DBF']);
    } finally {
      await pool.close();
    }
  });

  it('runs at most `size` emulators at once, each from a fresh boot', async () => {
    const pool = new HeadlessPool({ size: 2, cycles: 60000, keyDelayMs: 50 });
    let running = 0;
    let most = 0;
    try {
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          pool.use(
            SHIFA,
            async (emu) => {
              most = Math.max(most, ++running);
              try {
                return await saveBill(emu);
              } finally {
                running--;
              }
            },
            { dosTime: DOS_TIME },
          ),
        ),
      );
      expect(most).toBe(2);
      // A fresh boot each time: every run makes bill 9807-0001, the same diff.
      for (const d of results) expect(d).toEqual(results[0]);
    } finally {
      await pool.close();
    }
  });
});

describe('recordAction on the real Shifa (Prompt 29)', () => {
  it('a key that does nothing (Esc on the main menu) gives an empty diff', async () => {
    const pool = new HeadlessPool({ size: 1, cycles: 60000, keyDelayMs: 50 });
    try {
      const obs = await pool.use(
        SHIFA,
        async (emu) => {
          await waitFor(emu, 'MAIN MENU');
          return recordAction(emu, '{Esc}');
        },
        { dosTime: DOS_TIME },
      );
      expect(obs.stable).toBe(true);
      expect(obs.dbfDiff.tables).toEqual({});
      expect(obs.dbfDiff.unchanged).toEqual(DBFS);
      expect(obs.screenAfter.model.title?.name).toBe('MAIN MENU');
      expect(obs.screenAfter.fingerprint).toBe(obs.screenBefore.fingerprint);
    } finally {
      await pool.close();
    }
  });

  it('saving a bill (F2) records the inserts and the saved screen', async () => {
    const pool = new HeadlessPool({ size: 1, cycles: 60000, keyDelayMs: 50 });
    try {
      const [lines, save] = await pool.use(
        SHIFA,
        async (emu) => {
          await waitFor(emu, 'MAIN MENU');
          const a = await recordAction(
            emu,
            '1{Enter}PAN500{Enter}4{Enter}BRU400{Enter}2{Enter}{Enter}',
          );
          const b = await recordAction(emu, '{F2}');
          return [a, b] as const;
        },
        { dosTime: DOS_TIME },
      );
      // Entering lines changes nothing on disk; the save does.
      expect(lines.dbfDiff.tables).toEqual({});
      expect(lines.screenAfter.text.join('\n')).toContain('F2=Save bill');
      expect(save.dbfDiff.tables['BILLS.DBF']!.inserted.map((r) => r.values.BILL_NO)).toEqual([
        '9807-0001',
      ]);
      expect(save.dbfDiff.tables['BILLITEM.DBF']!.inserted).toHaveLength(2);
      expect(save.dbfDiff.tables['MEDICINE.DBF']!.updated.map((u) => u.key)).toEqual([
        'PAN500',
        'BRU400',
      ]);
      expect(save.screenAfter.text.join('\n')).toContain('BILL 9807-0001 SAVED');
      expect(save.keys).toBe('{F2}');
      expect(save.durationMs).toBeGreaterThanOrEqual(300);
    } finally {
      await pool.close();
    }
  });
});
