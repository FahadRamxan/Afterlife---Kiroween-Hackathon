import fc from 'fast-check';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BundleError, buildBundle, dosboxConf, isDosFileName } from './bundle';

const enc = new TextEncoder();
const dec = new TextDecoder();
const files = { 'SHIFA.EXE': enc.encode('MZ...'), 'MEDICINE.DBF': new Uint8Array([3, 98, 7, 1]) };

describe('dosboxConf', () => {
  it('mounts the bundle as C: and runs the program', () => {
    const conf = dosboxConf({ executable: 'SHIFA.EXE' });
    expect(conf).toMatch(/^\[autoexec\]\nmount c \.\nc:\nSHIFA\.EXE\n/m);
    expect(conf).toContain('cycles=fixed 20000');
    expect(conf).toContain('machine=svga_s3');
  });

  it('rejects an executable that is not a DOS program name', () => {
    expect(() => dosboxConf({ executable: 'shifa.exe; del *.*' })).toThrow(BundleError);
    expect(() => dosboxConf({ executable: 'README.TXT' })).toThrow(/EXE or COM/);
  });
});

describe('isDosFileName', () => {
  it.each(['SHIFA.EXE', 'MEDICINE.DBF', 'A.COM', 'BILLITEM.DBF', 'X1_2-3.DBF'])(
    'accepts %s',
    (n) => {
      expect(isDosFileName(n)).toBe(true);
    },
  );

  it.each([
    '../SHIFA.EXE',
    'C:\\SHIFA.EXE',
    '/etc/passwd',
    'dir/A.DBF',
    'TOOLONGNAME.DBF',
    'A.DBFX',
    '',
    '.jsdos',
    'A B.DBF',
    'shifa.exe',
  ])('rejects %j', (n) => {
    expect(isDosFileName(n)).toBe(false);
  });
});

describe('buildBundle', () => {
  it('is a zip with .jsdos/dosbox.conf and every file at the root', () => {
    const zip = unzipSync(buildBundle({ executable: 'SHIFA.EXE', files }));
    expect(Object.keys(zip).sort()).toEqual(['.jsdos/dosbox.conf', 'MEDICINE.DBF', 'SHIFA.EXE']);
    expect(dec.decode(zip['.jsdos/dosbox.conf'])).toContain('SHIFA.EXE');
    expect(zip['MEDICINE.DBF']).toEqual(files['MEDICINE.DBF']);
  });

  it('is byte-for-byte the same every time (fixed timestamps)', () => {
    expect(buildBundle({ executable: 'SHIFA.EXE', files })).toEqual(
      buildBundle({ executable: 'SHIFA.EXE', files }),
    );
  });

  it('refuses a bundle without its executable, or with an unsafe file name', () => {
    expect(() => buildBundle({ executable: 'IQRA.EXE', files })).toThrow(/not in the bundle/);
    expect(() =>
      buildBundle({
        executable: 'SHIFA.EXE',
        files: { ...files, '../EVIL.EXE': new Uint8Array(1) },
      }),
    ).toThrow(BundleError);
  });

  it('property: unzip(buildBundle(files)) gives back exactly the files', () => {
    const name = fc
      .tuple(
        // The same names as /^[A-Z0-9_-]{1,8}$/, built from characters: fc.stringMatching is too
        // slow for 2000 runs while every project's tests run at once (it timed out in ci:local).
        fc
          .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'), {
            minLength: 1,
            maxLength: 8,
          })
          .map((c) => c.join('')),
        fc.constantFrom('DBF', 'EXE', 'COM', 'TXT', 'DAT'),
      )
      .map(([b, e]) => `${b}.${e}`);
    fc.assert(
      fc.property(
        fc.dictionary(name, fc.uint8Array({ maxLength: 300 }), { minKeys: 1, maxKeys: 6 }),
        (extra) => {
          const all = { ...extra, 'APP.EXE': new Uint8Array([0x4d, 0x5a]) };
          const zip = unzipSync(buildBundle({ executable: 'APP.EXE', files: all }));
          delete zip['.jsdos/dosbox.conf'];
          expect(zip).toEqual(all);
        },
      ),
    );
  });
});
