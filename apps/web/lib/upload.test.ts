import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { inspectUrl, inspectZip, postInspect } from './upload';

const DIST = resolve(__dirname, '../../../samples/graveyard/dist/shifa');
const file = (name: string) => new Uint8Array(readFileSync(resolve(DIST, name)));
const zip = (entries: Record<string, Uint8Array>) => zipSync(entries);

describe('inspectZip (the upload card reads the zip in the browser)', () => {
  it('finds the program and the DBF files of a real Shifa zip', () => {
    const r = inspectZip(
      zip({
        'SHIFA.EXE': file('SHIFA.EXE'),
        'MEDICINE.DBF': file('MEDICINE.DBF'),
        'BILLS.DBF': file('BILLS.DBF'),
        'README.TXT': new TextEncoder().encode('hello'),
      }),
    );
    expect(r).toMatchObject({ ok: true, program: 'SHIFA.EXE' });
    if (!r.ok) throw new Error('expected ok');
    expect(r.entries).toEqual(['SHIFA.EXE', 'MEDICINE.DBF', 'BILLS.DBF', 'README.TXT']);
    expect(r.dbfs.map((d) => d.name)).toEqual(['MEDICINE.DBF', 'BILLS.DBF']);
    expect(r.dbfs[0]!.bytes).toEqual(file('MEDICINE.DBF'));
  });

  it('accepts a .COM program and files in a folder, in any letter case', () => {
    const r = inspectZip(
      zip({ 'APP/shop.com': new Uint8Array([0xc3]), 'APP/stock.dbf': file('MEDICINE.DBF') }),
    );
    expect(r).toMatchObject({ ok: true, program: 'APP/shop.com' });
  });

  it('refuses a zip without a program', () => {
    expect(inspectZip(zip({ 'MEDICINE.DBF': file('MEDICINE.DBF') }))).toEqual({
      ok: false,
      reason: 'no-program',
      entries: ['MEDICINE.DBF'],
    });
  });

  it('refuses a zip without DBF files', () => {
    expect(inspectZip(zip({ 'SHIFA.EXE': file('SHIFA.EXE') }))).toEqual({
      ok: false,
      reason: 'no-dbf',
      entries: ['SHIFA.EXE'],
    });
  });

  it('refuses a file that is named .zip but is not a zip', () => {
    expect(inspectZip(new TextEncoder().encode('PK\x03\x04 not really'))).toEqual({
      ok: false,
      reason: 'not-a-zip',
      entries: [],
    });
  });

  // Random bytes are almost never zip-like, so most runs damage a real zip instead: a few bytes
  // overwritten anywhere (headers, sizes, compressed data) or the file cut short.
  const real = zip({
    'SHIFA.EXE': new Uint8Array([0x4d, 0x5a]),
    'MEDICINE.DBF': file('MEDICINE.DBF'),
  });
  const damaged = fc.oneof(
    { weight: 1, arbitrary: fc.uint8Array({ maxLength: 300 }) },
    {
      weight: 3,
      arbitrary: fc
        .array(fc.tuple(fc.nat(real.length - 1), fc.integer({ min: 0, max: 255 })), {
          minLength: 1,
          maxLength: 4,
        })
        .map((edits) => {
          const b = real.slice();
          for (const [at, v] of edits) b[at] = v;
          return b;
        }),
    },
    { weight: 1, arbitrary: fc.nat(real.length).map((n) => real.slice(0, n)) },
  );

  it(
    'never throws, whatever the bytes, and an ok result always has a program and a DBF',
    () => {
      fc.assert(
        fc.property(damaged, (bytes) => {
          const r = inspectZip(bytes);
          if (r.ok) {
            expect(r.program).toMatch(/\.(exe|com)$/i);
            expect(r.dbfs.length).toBeGreaterThan(0);
          }
        }),
      );
    },
    // 2000 runs in ci:local take about 4 s on their own, more with every project running at once.
    30_000,
  );
});

describe('inspectUrl', () => {
  it('is the API base plus /api/dbf/inspect, or null when the API is not configured', () => {
    expect(inspectUrl('http://localhost:4000/')).toBe('http://localhost:4000/api/dbf/inspect');
    expect(inspectUrl(undefined)).toBeNull();
  });
});

describe('postInspect (with a fake fetch, no network)', () => {
  const dbfs = [{ name: 'MEDICINE.DBF', bytes: file('MEDICINE.DBF') }];

  it('sends the DBF files as multipart "files" and returns the tables', async () => {
    let sent: FormData | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = init?.body as FormData;
      return Response.json({ tables: [{ file: 'MEDICINE.DBF', recordCount: 40 }] });
    }) as typeof fetch;
    const r = await postInspect('http://api', dbfs, fake);
    expect(r).toMatchObject({ ok: true, tables: [{ file: 'MEDICINE.DBF' }] });
    expect((sent!.get('files') as File).name).toBe('MEDICINE.DBF');
  });

  it("returns the API's error message for a 400", async () => {
    const fake = (async () =>
      Response.json(
        {
          error: 'BAD_DBF',
          file: 'MEDICINE.DBF',
          message: 'Not a supported .DBF version byte: 0x4d',
        },
        { status: 400 },
      )) as typeof fetch;
    expect(await postInspect('http://api', dbfs, fake)).toEqual({
      ok: false,
      message: 'MEDICINE.DBF: Not a supported .DBF version byte: 0x4d',
    });
  });

  it('says the API is unreachable when fetch fails', async () => {
    const fake = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await postInspect('http://api', dbfs, fake)).toEqual({ ok: false, message: null });
  });
});
