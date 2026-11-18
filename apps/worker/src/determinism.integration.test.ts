// Prompt 30: the same key script from a fresh state gives the same data files, 20 times out of 20.
// The real Shifa EXE in js-dos v8, headless.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDbf } from '@afterlife/dbf';
import { waitForStableScreen, withFreshState } from '@afterlife/emulator';
import fc from 'fast-check';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { HeadlessPool } from '@afterlife/emulator/headless';

vi.setConfig({ testTimeout: 600_000 });

const SHIFA = new Uint8Array(
  readFileSync(resolve(__dirname, '../../../apps/web/public/graveyard/shifa.jsdos')),
);
const DBFS = ['BILLITEM.DBF', 'BILLS.DBF', 'CUSTOMER.DBF', 'MEDICINE.DBF'];
const RUNS = 20;

// Medicines in stock and in date for the whole seeded year (no "expired" stop in the script).
const MEDICINES = ['PAN500', 'BRU400', 'FLA400', 'DIS500', 'VEN100', 'ZAN150', 'GRA001'];

/** One action and the screen it must lead to. */
type Step = { keys: string; until: RegExp };

/**
 * A walk-in bill of 1 to 3 lines, saved, back on the main menu, as steps. Each step waits for the
 * screen it leads to, not just a still screen: a busy DOS program (saving, or short of CPU) can
 * look still for longer than 300 ms, and a key sent then is lost at "PRESS ANY KEY". Each step is
 * at most 9 keys, well inside the 15-key DOS keyboard buffer. The Crew acts the same way.
 */
const billScript = fc
  .uniqueArray(fc.tuple(fc.constantFrom(...MEDICINES), fc.integer({ min: 1, max: 5 })), {
    minLength: 1,
    maxLength: 3,
    selector: ([code]) => code,
  })
  .map((lines): Step[] => [
    { keys: '1', until: /Customer ID \(blank = walk-in\):/ },
    { keys: '{Enter}', until: /Code:/ },
    // The code, seen in its field, then its quantity: a 10-key burst once lost all but "PA".
    ...lines.flatMap(([c, q], i): Step[] => [
      { keys: c, until: new RegExp(`Code: ${c} `) },
      {
        keys: `{Enter}${q}{Enter}`,
        until: new RegExp(`^ +${i + 1} ${c} .* ${q} +[\\d.]+ *$`, 'm'),
      },
    ]),
    { keys: '{Enter}', until: /F2=Save bill/ },
    { keys: '{F2}', until: /SAVED/ },
    { keys: '{Enter}', until: /MAIN MENU/ },
  ]);

// Four emulators at once (2 made the 20 runs too slow). Real-emulator files run one at a time,
// after every other test. Keys go at the controller's default pace (100 ms): at 50 ms a loaded
// machine lost keys (js-dos stamps each key with wall-clock time, and a starved DOSBox lags it).
const pool = new HeadlessPool({ size: 4, cycles: 60000 });
afterAll(() => pool.close());

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** Runs the script from a fresh state and returns the data files' bytes. */
async function run(script: Step[], seed: number): Promise<Record<string, string>> {
  const emu = await pool.acquire();
  try {
    return await withFreshState(emu, SHIFA, { seed }, async (e) => {
      const wait = (until: RegExp) =>
        waitForStableScreen(e, {
          maxWaitMs: 60_000,
          until: (sc) => until.test(sc.text.join('\n')),
        });
      expect((await wait(/MAIN MENU/)).stable).toBe(true);
      for (const step of script) {
        await e.sendKeys(step.keys);
        const r = await wait(step.until);
        // On failure, say what the screen showed instead.
        expect(r.stable, `after ${step.keys}, the screen was:\n${r.screen.text.join('\n')}`).toBe(
          true,
        );
      }
      return Object.fromEntries(
        await Promise.all(DBFS.map(async (f) => [f, hex(await e.readFile(f))])),
      );
    });
  } finally {
    await pool.release(emu);
  }
}

describe('determinism on the real Shifa', () => {
  it(`the same key script from a fresh state gives identical DBF bytes ${RUNS} times out of ${RUNS}`, async () => {
    await fc.assert(
      fc.asyncProperty(billScript, fc.integer({ min: 0, max: 1000 }), async (script, seed) => {
        const results = await Promise.all(Array.from({ length: RUNS }, () => run(script, seed)));
        // Not vacuous: each run really saved one more bill.
        const bills = readDbf(new Uint8Array(Buffer.from(results[0]!['BILLS.DBF']!, 'hex')));
        expect(bills.records).toHaveLength(4);
        const distinct = new Set(results.map((r) => JSON.stringify(r)));
        expect(distinct.size, `${script.map((x) => x.keys).join('')} with seed ${seed}`).toBe(1);
      }),
      // One generated bill, run 20 times (about 30 s): the case count does not follow FC_NUM_RUNS.
      { numRuns: 1 },
    );
  });

  it('a different DOS clock gives a different bill (the clock really is part of the state)', async () => {
    const script = fc.sample(billScript, { seed: 42, numRuns: 1 })[0]!;
    // Seeds 1 and 2 give 4 and 8 November 1998: the saved bill carries the DOS date.
    const [a, b] = await Promise.all([run(script, 1), run(script, 2)]);
    const billDate = (r: Record<string, string>) =>
      readDbf(new Uint8Array(Buffer.from(r['BILLS.DBF']!, 'hex'))).records.at(-1)!.values.BILL_DATE;
    expect([billDate(a), billDate(b)]).toEqual(['19981104', '19981108']);
  });
});
