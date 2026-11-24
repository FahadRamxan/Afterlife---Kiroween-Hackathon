// @spec oracle-proof#2.2 The old app on a slow machine: a DOS program can leave its screen as it
// was for a while before it writes the save (the full CI run, four emulators and little free
// memory). The case must see the write, not read the files before it lands.
import { FakeEmulator, buildBundle, observeScreen, type KeyStroke } from '@afterlife/emulator';
import { readDbf, writeDbf, type DbfTable } from '@afterlife/dbf';
import { renderScreen, unicodeToCp437, type CellInput } from '@afterlife/screen';
import { SHIFA_AS_IT_RUNS_SOUL } from '@afterlife/soul/examples/shifa';
import { describe, expect, it } from 'vitest';
import { emulatorOldApp } from './old-app';
const CUSTOMERS: DbfTable = {
  fields: [
    { name: 'CUST_ID', type: 'C', length: 5, decimals: 0 },
    { name: 'NAME', type: 'C', length: 20, decimals: 0 },
    { name: 'PHONE', type: 'C', length: 12, decimals: 0 },
  ],
  records: [{ deleted: false, values: { CUST_ID: 'C0001', NAME: 'Ahmed', PHONE: '0300' } }],
};
const BUNDLE = buildBundle({
  executable: 'SHIFA.EXE',
  files: { 'SHIFA.EXE': new Uint8Array([0xc3]), 'CUSTOMER.DBF': writeDbf(CUSTOMERS) },
});
/** A fake Shifa that saves a customer `lateMs` after the Enter that ends the phone number. */
function slowShop(lateMs: number) {
  let enters = 0;
  return new FakeEmulator({
    onKeys: (keys: KeyStroke[], app) => {
      enters += keys.filter((k) => k.kind === 'key' && k.key === 'Enter').length;
      if (enters < 2) return;
      enters = 0;
      setTimeout(() => {
        const t = readDbf(app.files.get('CUSTOMER.DBF')!);
        app.files.set(
          'CUSTOMER.DBF',
          writeDbf({
            ...t,
            records: [
              ...t.records,
              { deleted: false, values: { CUST_ID: 'C0002', NAME: 'Bilal', PHONE: '0321' } },
            ],
          }),
        );
      }, lateMs);
    },
  });
}
/**
 * A fake customer form that shows what is typed at its prompt, cursor after it. `drop` loses the
 * keys of the first text typed after its nth character (a loaded emulator dropping keys).
 */
function echoShop(drop?: number, showCursor = true) {
  let prompt = 'Name:';
  let typed = '';
  let dropped = false;
  let opened = false;
  const draw = (app: { setScreen: (s: ReturnType<typeof renderScreen>) => void }) => {
    const line = `${prompt} ${typed}`;
    const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
      Array.from({ length: 80 }, (_, c) => ({
        code: r === 5 && c < line.length ? unicodeToCp437(line)[c]! : 0x20,
        fg: 7,
        bg: 1,
      })),
    );
    cells[0] = Array.from({ length: 80 }, (_, c) => ({
      code: unicodeToCp437('CUSTOMERS'.padEnd(80))[c]!,
      fg: 15,
      bg: 1,
    }));
    app.setScreen(
      renderScreen({
        cellWidth: 8,
        cellHeight: 16,
        cells,
        cursor: showCursor ? { row: 5, col: line.length } : null,
      }),
    );
  };
  return new FakeEmulator({
    onKeys: (keys, app) => {
      for (const k of keys) {
        if (k.kind === 'text') {
          let t = k.text;
          // "A" opens the form (Add): a key, not something it shows.
          if (!opened && t.startsWith('A')) {
            opened = true;
            t = t.slice(1);
          }
          if (drop !== undefined && !dropped) {
            dropped = true;
            t = t.slice(0, drop);
          }
          typed += t;
        } else if (k.key === 'Enter') {
          if (prompt === 'Phone:') {
            prompt = 'Name:';
            const t = readDbf(app.files.get('CUSTOMER.DBF')!);
            app.files.set(
              'CUSTOMER.DBF',
              writeDbf({
                ...t,
                records: [
                  ...t.records,
                  { deleted: false, values: { CUST_ID: 'C0002', NAME: 'X', PHONE: '1' } },
                ],
              }),
            );
          } else prompt = 'Phone:';
          typed = '';
        }
      }
      draw(app);
    },
  });
}
async function customerForm(emu: FakeEmulator) {
  await emu.boot(BUNDLE);
  await emu.sendKeys('{Esc}');
  const here = (await observeScreen(emu)).fingerprint;
  const soul = {
    ...SHIFA_AS_IT_RUNS_SOUL,
    actions: SHIFA_AS_IT_RUNS_SOUL.actions.map((a) =>
      a.id === 'add-customer' ? { ...a, screen: here, keys: 'A{@NAME}{Enter}{@PHONE}{Enter}' } : a,
    ),
  };
  return emulatorOldApp(emu, {
    soul,
    bootWaitMs: 200,
    graph: {
      nodes: [{ fingerprint: here, title: 'CUSTOMERS', firstSeen: 0, visits: 1 }],
      edges: [],
    },
  });
}
const BILAL = { actionId: 'add-customer', inputs: { values: { NAME: 'BILAL', PHONE: '0321' } } };
describe('emulatorOldApp and lost keys', () => {
  it('types each text, sees it on the screen, then presses the key that ends it', async () => {
    const r = await (await customerForm(echoShop())).run(BILAL);
    expect(r.effects.tables['CUSTOMER.DBF']?.inserted).toHaveLength(1);
  }, 20_000);
  it('keys the emulator lost are an error to run again, not something the old app did', async () => {
    // "BI" reaches the form and "LAL" does not: the case must not go on and press Enter.
    await expect((await customerForm(echoShop(2))).run(BILAL)).rejects.toThrow(
      'The old app did not get all the keys typed: "BILAL" shows as "BI"',
    );
  }, 20_000);
  it('also when the cursor is not shown (it blinks): the text must be on the screen', async () => {
    await expect((await customerForm(echoShop(2, false))).run(BILAL)).rejects.toThrow(
      'The old app did not get all the keys typed',
    );
    const r = await (await customerForm(echoShop(undefined, false))).run(BILAL);
    expect(r.effects.tables['CUSTOMER.DBF']?.inserted).toHaveLength(1);
  }, 30_000);
});
describe('emulatorOldApp on a slow machine', () => {
  it('waits for a save the app writes after its screen has already settled', async () => {
    const emu = slowShop(900);
    await emu.boot(BUNDLE);
    const here = (await observeScreen(emu)).fingerprint;
    const soul = {
      ...SHIFA_AS_IT_RUNS_SOUL,
      actions: SHIFA_AS_IT_RUNS_SOUL.actions.map((a) =>
        a.id === 'add-customer' ? { ...a, screen: here } : a,
      ),
    };
    const old = emulatorOldApp(emu, {
      soul,
      // The fake's screen is blank: no first screen to wait for.
      bootWaitMs: 200,
      graph: {
        nodes: [{ fingerprint: here, title: 'CUSTOMERS', firstSeen: 0, visits: 1 }],
        edges: [],
      },
    });
    const r = await old.run({
      actionId: 'add-customer',
      inputs: { values: { NAME: 'Bilal', PHONE: '0321' } },
    });
    expect(r.effects.tables['CUSTOMER.DBF']?.inserted).toHaveLength(1);
  }, 20_000);
});
