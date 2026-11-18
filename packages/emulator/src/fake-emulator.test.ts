import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundle } from './bundle';
import { EmulatorError, dosDir, dosPath } from './controller';
import { controllerContract } from './controller-contract';
import { FakeEmulator } from './fake-emulator';
import { parseKeys } from './keys';

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
const FILES = ['BILLITEM.DBF', 'BILLS.DBF', 'CUSTOMER.DBF', 'MEDICINE.DBF', 'SHIFA.EXE'];
const bundle = buildBundle({
  executable: 'SHIFA.EXE',
  files: Object.fromEntries(FILES.map((f) => [f, new Uint8Array(readFileSync(resolve(DIST, f)))])),
});

controllerContract('FakeEmulator', {
  make: async () => new FakeEmulator(),
  bundle,
  files: FILES,
});

describe('dosPath', () => {
  it.each([
    ['MEDICINE.DBF', 'MEDICINE.DBF'],
    ['medicine.dbf', 'MEDICINE.DBF'],
    ['C:\\MEDICINE.DBF', 'MEDICINE.DBF'],
    ['c:/data/bills.dbf', 'DATA/BILLS.DBF'],
    ['\\DATA\\\\BILLS.DBF', 'DATA/BILLS.DBF'],
  ])('%s is %s', (p, want) => {
    expect(dosPath(p)).toBe(want);
  });

  it.each(['', '..', '../x.dbf', 'D:\\X.DBF', 'a name.dbf', 'TOOLONGNAME.DBF', 'X.DBFX'])(
    'refuses %j',
    (p) => {
      expect(() => dosPath(p)).toThrow(EmulatorError);
    },
  );

  it('the root folder is "" in any spelling', () => {
    expect(dosDir()).toBe('');
    expect(dosDir('C:\\')).toBe('');
    expect(dosDir('/')).toBe('');
    expect(dosDir('data')).toBe('DATA');
  });
});

describe('FakeEmulator', () => {
  it('lets a test script the old app: keys change files and the screen', async () => {
    const screen = { width: 640, height: 400, rgba: new Uint8Array(640 * 400 * 4).fill(7) };
    const fake = new FakeEmulator({
      onKeys: (keys, app) => {
        if (keys.some((k) => k.kind === 'key' && k.key === 'F2')) {
          app.files.set('BILLS.DBF', new Uint8Array([42]));
          app.setScreen(screen);
        }
      },
    });
    await fake.boot(bundle, { dosTime: '1998-07-15 10:00:00', cycles: 30000 });
    expect(fake.dosTime).toBe('1998-07-15 10:00:00');
    expect(fake.cycles).toBe(30000);
    await fake.sendKeys('1{Enter}PAN500{Enter}4{Enter}{Enter}');
    expect((await fake.readFile('BILLS.DBF'))[0]).not.toBe(42);
    await fake.sendKeys('{F2}');
    expect(await fake.readFile('BILLS.DBF')).toEqual(new Uint8Array([42]));
    expect((await fake.screenshot()).rgba[0]).toBe(7);
    expect(fake.log).toEqual([
      parseKeys('1{Enter}PAN500{Enter}4{Enter}{Enter}'),
      parseKeys('{F2}'),
    ]);
  });

  it('lists files in a folder', async () => {
    const fake = new FakeEmulator();
    await fake.boot(bundle);
    await fake.writeFile('DATA\\OLD.DBF', new Uint8Array([1]));
    expect(await fake.listFiles('DATA')).toEqual(['DATA/OLD.DBF']);
    expect(await fake.listFiles()).not.toContain('DATA/OLD.DBF');
  });

  it('refuses something that is not a bundle', async () => {
    const fake = new FakeEmulator();
    await expect(fake.boot(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({
      code: 'BAD_BUNDLE',
    });
  });

  it('exit stops it', async () => {
    const fake = new FakeEmulator();
    await fake.boot(bundle);
    await fake.exit();
    await expect(fake.screenshot()).rejects.toMatchObject({ code: 'NOT_BOOTED' });
  });
});
