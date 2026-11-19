// Prompt 40 security tests: what an uploaded zip may contain before it becomes a js-dos bundle.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { LIMITS, isDosProgram, unpackDeadApp } from './dead-app';

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
const SHIFA_EXE = new Uint8Array(readFileSync(resolve(DIST, 'SHIFA.EXE')));
const MEDICINE = new Uint8Array(readFileSync(resolve(DIST, 'MEDICINE.DBF')));
const zip = (files: Zippable) => zipSync(files);

/** A minimal Windows PE: an MZ stub whose e_lfanew points at "PE\0\0". */
function windowsExe(): Uint8Array {
  const b = new Uint8Array(256);
  b.set([0x4d, 0x5a]);
  new DataView(b.buffer).setUint32(0x3c, 0x80, true);
  b.set([0x50, 0x45, 0, 0], 0x80);
  return b;
}

describe('unpackDeadApp', () => {
  it('accepts a DOS program and its DBF files, and gives back 8.3 names for the bundle', () => {
    const r = unpackDeadApp(zip({ 'SHIFA.EXE': SHIFA_EXE, 'MEDICINE.DBF': MEDICINE }));
    expect(r).toMatchObject({ ok: true, executable: 'SHIFA.EXE' });
    if (!r.ok) throw new Error('unreachable');
    expect(Object.keys(r.files).sort()).toEqual(['MEDICINE.DBF', 'SHIFA.EXE']);
    expect(r.files['SHIFA.EXE']).toEqual(SHIFA_EXE);
  });

  it('takes a zip of a folder (the usual way to zip an app), and lower-case names', () => {
    const r = unpackDeadApp(zip({ shifa: { 'shifa.exe': SHIFA_EXE, 'medicine.dbf': MEDICINE } }));
    expect(r).toMatchObject({ ok: true, executable: 'SHIFA.EXE' });
  });

  describe('zip-slip: no entry may point outside the bundle', () => {
    for (const name of [
      '../SHIFA.EXE',
      'APP/../../SHIFA.EXE',
      '/etc/SHIFA.EXE',
      'C:/DOS/SHIFA.EXE',
      'C:SHIFA.EXE',
      '..\\..\\SHIFA.EXE',
      'APP\\..\\SHIFA.EXE',
    ])
      it(JSON.stringify(name), () => {
        const z = zip({ 'MEDICINE.DBF': MEDICINE, [name]: SHIFA_EXE });
        expect(unpackDeadApp(z)).toMatchObject({ ok: false, code: 'ZIP_SLIP' });
      });

    it('property: any name with a ".." part is refused, wherever it is', () => {
      const part = fc.stringMatching(/^[A-Z0-9]{1,8}$/);
      fc.assert(
        fc.property(fc.array(part, { maxLength: 3 }), fc.array(part, { maxLength: 3 }), (a, b) => {
          const name = [...a, '..', ...b, 'X.DBF'].join('/');
          expect(unpackDeadApp(zip({ 'SHIFA.EXE': SHIFA_EXE, [name]: MEDICINE }))).toMatchObject({
            ok: false,
            code: 'ZIP_SLIP',
          });
        }),
      );
    });
  });

  describe('only DOS programs', () => {
    it('refuses a Windows program (PE) even with a .EXE name and an MZ header', () => {
      const r = unpackDeadApp(zip({ 'SETUP.EXE': windowsExe(), 'MEDICINE.DBF': MEDICINE }));
      expect(r).toMatchObject({
        ok: false,
        code: 'NOT_DOS',
        message: expect.stringMatching(/Windows/),
      });
    });

    it('refuses an ELF, a Mach-O and a script dressed as .COM or .EXE', () => {
      for (const bytes of [
        new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]),
        new Uint8Array([0xcf, 0xfa, 0xed, 0xfe, 7, 0, 0, 1]),
        strToU8('#!/bin/sh\nrm -rf /\n'),
      ]) {
        expect(unpackDeadApp(zip({ 'APP.COM': bytes, 'A.DBF': MEDICINE }))).toMatchObject({
          ok: false,
          code: 'NOT_DOS',
        });
        expect(unpackDeadApp(zip({ 'APP.EXE': bytes, 'A.DBF': MEDICINE }))).toMatchObject({
          ok: false,
          code: 'NOT_DOS',
        });
      }
    });

    it('a .COM is at most 65,280 bytes (it must fit one 64 kB segment)', () => {
      const big = new Uint8Array(65_281).fill(0x90);
      expect(isDosProgram('A.COM', big)).toMatchObject({ ok: false });
      expect(isDosProgram('A.COM', big.slice(0, 65_280))).toEqual({ ok: true });
      expect(isDosProgram('SHIFA.EXE', SHIFA_EXE)).toEqual({ ok: true });
    });
  });

  it('refuses file types that are not on the allow-list, naming them', () => {
    const r = unpackDeadApp(
      zip({
        'SHIFA.EXE': SHIFA_EXE,
        'MEDICINE.DBF': MEDICINE,
        'RUN.BAT': strToU8('del *.*'),
        'X.DLL': new Uint8Array(4),
      }),
    );
    expect(r).toMatchObject({ ok: false, code: 'FILE_TYPE' });
    expect((r as { message: string }).message).toMatch(/RUN\.BAT.*X\.DLL|X\.DLL.*RUN\.BAT/);
  });

  it('refuses names that are not DOS 8.3 names, and two files with the same name', () => {
    expect(
      unpackDeadApp(zip({ 'SHIFA.EXE': SHIFA_EXE, 'MEDICINE-LIST.DBF': MEDICINE })),
    ).toMatchObject({ ok: false, code: 'NOT_DOS_NAME' });
    expect(
      unpackDeadApp(
        zip({ 'SHIFA.EXE': SHIFA_EXE, 'A/MEDICINE.DBF': MEDICINE, 'B/MEDICINE.DBF': MEDICINE }),
      ),
    ).toMatchObject({ ok: false, code: 'DUPLICATE_NAME' });
  });

  it('refuses DOS device names: CON.DBF would open the console, not a file', () => {
    for (const n of ['CON.DBF', 'nul.dbf', 'LPT1.TXT', 'AUX.EXE'])
      expect(
        unpackDeadApp(zip({ 'SHIFA.EXE': SHIFA_EXE, 'MEDICINE.DBF': MEDICINE, [n]: MEDICINE })),
      ).toMatchObject({
        ok: false,
        code: 'NOT_DOS_NAME',
      });
  });

  it('size limits: too many files, too much unpacked, and a zip bomb', () => {
    const many: Zippable = { 'SHIFA.EXE': SHIFA_EXE };
    for (let i = 0; i <= LIMITS.maxFiles; i++) many[`F${i}.DBF`] = MEDICINE;
    expect(unpackDeadApp(zip(many))).toMatchObject({ ok: false, code: 'TOO_MANY_FILES' });

    // 30 MB of zeros squeezes to a few kB: refused before it is unpacked.
    const bomb = zip({ 'SHIFA.EXE': SHIFA_EXE, 'BIG.DBF': new Uint8Array(30 * 1024 * 1024) });
    expect(bomb.length).toBeLessThan(200_000);
    expect(unpackDeadApp(bomb)).toMatchObject({ ok: false, code: 'TOO_BIG' });
  });

  it('needs exactly one program unless one is chosen, and at least one DBF', () => {
    expect(unpackDeadApp(zip({ 'MEDICINE.DBF': MEDICINE }))).toMatchObject({
      ok: false,
      code: 'NO_PROGRAM',
    });
    expect(unpackDeadApp(zip({ 'SHIFA.EXE': SHIFA_EXE }))).toMatchObject({
      ok: false,
      code: 'NO_DBF',
    });
    const two = zip({ 'SHIFA.EXE': SHIFA_EXE, 'SETUP.EXE': SHIFA_EXE, 'MEDICINE.DBF': MEDICINE });
    expect(unpackDeadApp(two)).toMatchObject({ ok: false, code: 'WHICH_PROGRAM' });
    expect(unpackDeadApp(two, { executable: 'SHIFA.EXE' })).toMatchObject({
      ok: true,
      executable: 'SHIFA.EXE',
    });
    expect(unpackDeadApp(two, { executable: '../X.EXE' })).toMatchObject({
      ok: false,
      code: 'WHICH_PROGRAM',
    });
  });

  it('refuses bytes that are not a zip', () => {
    expect(unpackDeadApp(strToU8('PK\x03\x04 not really'))).toMatchObject({
      ok: false,
      code: 'NOT_A_ZIP',
    });
  });

  it('round-trip: what it accepts unpacks to exactly the bytes that went in', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc
            .stringMatching(/^[A-Z][A-Z0-9]{0,7}$/)
            .filter((n) => !/^(CON|PRN|AUX|NUL|COM[1-4]|LPT[1-3])$/.test(n)),
          { minLength: 1, maxLength: 5 },
        ),
        fc.uint8Array({ maxLength: 64 }),
        (names, extra) => {
          const files: Record<string, Uint8Array> = { 'SHIFA.EXE': SHIFA_EXE };
          for (const n of names)
            files[`${n}.DBF`] = new Uint8Array([...MEDICINE.slice(0, 32), ...extra]);
          const r = unpackDeadApp(zip(files));
          expect(r.ok).toBe(true);
          if (r.ok) expect(unzipSync(zip(r.files))).toEqual(unzipSync(zip(files)));
        },
      ),
    );
  });
});
