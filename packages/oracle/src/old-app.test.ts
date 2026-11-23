// @spec oracle-proof#2.2 The old app on a slow machine: a DOS program can leave its screen as it
// was for a while before it writes the save (the full CI run, four emulators and little free
// memory). The case must see the write, not read the files before it lands.
import { FakeEmulator, buildBundle, observeScreen, type KeyStroke } from '@afterlife/emulator';
import { readDbf, writeDbf, type DbfTable } from '@afterlife/dbf';
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
