// Prompt 11: checks the committed outputs of the DOS toolchain without needing Docker.
// `pnpm graveyard:test` (Docker) rebuilds everything and refreshes the fixtures checked here.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const g = resolve(__dirname, '../samples/graveyard');
const read = (p: string) => readFileSync(resolve(g, p), 'utf8').replace(/\r\n/g, '\n');
const bytes = (p: string) => new Uint8Array(readFileSync(resolve(g, p)));

describe('toolchain image (Prompt 11)', () => {
  const dockerfile = read('toolchain/Dockerfile');

  it('pins a dated Open Watcom v2 release and verifies its checksum', () => {
    expect(dockerfile).toMatch(
      /open-watcom-v2\/releases\/download\/\d{4}-\d{2}-\d{2}-Build\/ow-snapshot\.tar\.xz/,
    );
    expect(dockerfile).toMatch(/--checksum=sha256:[0-9a-f]{64}/);
  });

  it('includes DOSBox to run the EXEs and gcc for host tests', () => {
    expect(dockerfile).toMatch(/\bdosbox\b/);
    expect(dockerfile).toMatch(/\bfaketime\b/);
    expect(dockerfile).toMatch(/\bgcc\b/);
  });

  it('build.sh compiles 16-bit DOS EXEs with warnings as errors and copies seed DBFs', () => {
    const sh = read('toolchain/build.sh');
    expect(sh).toMatch(/wcl -bt=dos -ms/);
    expect(sh).toContain('-we');
    expect(sh).toMatch(/seed\/\*\.DBF/);
    expect(sh).toContain('OUT="${OUT:-dist}"'); // defaults to dist/
    expect(sh).toContain('-fe="$OUT/$app/$EXE"'); // so each app lands in dist/<app>/<EXE>
    expect(sh).toContain('-k8192'); // the 2 KB default stack overflows
  });
});

describe('dbf3 C library (Prompt 11)', () => {
  const h = read('toolchain/lib/dbf3.h');
  it.each([
    'dbf_create',
    'dbf_open',
    'dbf_read',
    'dbf_write',
    'dbf_append',
    'dbf_delete',
    'dbf_close',
    'dbf_put_num',
    'dbf_get_num',
  ])('declares %s', (fn) => {
    expect(h).toMatch(new RegExp(`\\b${fn}\\(`));
  });

  it('uses long for record counts, so they do not overflow a 16-bit int', () => {
    expect(h).toMatch(/unsigned long nrecs;/);
  });
});

describe('hello sample: built EXE (Prompt 11)', () => {
  it('is a real DOS MZ executable', () => {
    const exe = bytes('dist/hello/HELLO.EXE');
    expect(String.fromCharCode(exe[0]!, exe[1]!)).toBe('MZ');
    expect(exe.length).toBeGreaterThan(1000);
    expect(exe.length).toBeLessThan(64 * 1024); // small memory model fits one segment pair
  });
});

describe('hello sample: run in DOSBox (Prompt 11)', () => {
  it('test.sh checks the program output, so a crash cannot pass', () => {
    const sh = read('toolchain/test.sh');
    expect(sh).toContain("grep -q '^HELLO FROM 1998$'");
    expect(sh).toContain('READ 2 RECORDS');
  });

  it('printed its greeting and read back what it wrote', () => {
    const out = read('fixtures/hello/OUT.TXT');
    expect(out).toContain('HELLO FROM 1998');
    expect(out).toContain('WROTE 2 RECORDS');
    expect(out).toContain('READ 2 RECORDS: PAN500 45.50, ASP100 12.00');
  });

  // Byte-level check of the dBASE III file the DOS program wrote. Prompt 17 adds a readDbf check.
  describe('HELLO.DBF written by the DOS program', () => {
    const dbf = bytes('fixtures/hello/HELLO.DBF');
    const u16 = (o: number) => dbf[o]! | (dbf[o + 1]! << 8);
    const u32 = (o: number) => (u16(o) | (u16(o + 2) << 16)) >>> 0;
    const ascii = (from: number, to: number) => String.fromCharCode(...dbf.slice(from, to));

    it('has a dBASE III header', () => {
      expect(dbf[0]).toBe(0x03);
      expect(u32(4)).toBe(2); // records
      expect(u16(8)).toBe(32 + 2 * 32 + 1); // header length
      expect(u16(10)).toBe(1 + 6 + 8); // record length
    });

    it('has the two field descriptors and the 0x0D terminator', () => {
      expect(ascii(32, 43).replace(/\0+$/, '')).toBe('CODE');
      expect(ascii(43, 44)).toBe('C');
      expect(dbf[32 + 16]).toBe(6);
      expect(ascii(64, 75).replace(/\0+$/, '')).toBe('PRICE');
      expect(ascii(75, 76)).toBe('N');
      expect([dbf[64 + 16], dbf[64 + 17]]).toEqual([8, 2]);
      expect(dbf[96]).toBe(0x0d);
    });

    it('has fixed-width records with deletion flags, then 0x1A', () => {
      expect(ascii(97, 112)).toBe(' PAN500   45.50');
      expect(ascii(112, 127)).toBe(' ASP100   12.00');
      expect(dbf[127]).toBe(0x1a);
      expect(dbf.length).toBe(128);
    });

    it('stores the DOS date, 15 July 1998 (fixed by faketime), as the last update date', () => {
      expect([dbf[1], dbf[2], dbf[3]]).toEqual([98, 7, 15]);
    });
  });
});

describe('dbf3 unit tests ran on both compilers (Prompt 11)', () => {
  it.each(['gcc', 'dos'])('%s run passed', (target) => {
    const log = read(`fixtures/dbf3test/${target}.txt`);
    expect(log).toMatch(/^ALL \d+ CHECKS PASSED$/m);
    expect(log).not.toContain('FAIL');
  });

  it('the fixtures exist', () => {
    expect(existsSync(resolve(g, 'fixtures/dbf3test/dos.txt'))).toBe(true);
  });
});
