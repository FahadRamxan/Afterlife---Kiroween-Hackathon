import { dbfPreviewBytes, writeDbf, type DbfRecord } from '@afterlife/dbf';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_PREVIEW_FILES, inspectUrl, inspectZip, postInspect } from './upload';

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
  const read = (file: string, recordCount: number) => ({ file, ok: true, recordCount });

  it('sends each DBF cut to its header and first 100 records, with cut=100', async () => {
    let sent: FormData | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = init?.body as FormData;
      return Response.json({ files: [read('MEDICINE.DBF', 40)] });
    }) as typeof fetch;
    const big = writeDbf({
      fields: [{ name: 'N', type: 'N', length: 5, decimals: 0 }],
      records: Array.from({ length: 5000 }, (_, i): DbfRecord => ({
        deleted: false,
        values: { N: String(i) },
      })),
    });
    const r = await postInspect('http://api', [{ name: 'BILLITEM.DBF', bytes: big }], fake);
    expect(r).toMatchObject({ ok: true, files: [{ file: 'BILLITEM.DBF', ok: true }] });
    const part = sent!.get('files') as File;
    expect(part.name).toBe('BILLITEM.DBF');
    expect(part.size).toBe(dbfPreviewBytes(big, 100).length);
    expect(part.size).toBeLessThan(big.length / 40);
    expect(sent!.get('cut')).toBe('100');
  });

  it('labels each file with its path in the zip, so two MEDICINE.DBF in folders stay apart', async () => {
    // The API keeps only the base name and answers in the order the files were sent.
    const fake = (async () =>
      Response.json({
        files: [read('MEDICINE.DBF', 40), read('MEDICINE.DBF', 38)],
      })) as typeof fetch;
    const r = await postInspect(
      'http://api',
      [
        { name: 'DATA/MEDICINE.DBF', bytes: file('MEDICINE.DBF') },
        { name: 'BACKUP/MEDICINE.DBF', bytes: file('MEDICINE.DBF') },
      ],
      fake,
    );
    expect(r.ok && r.files.map((t) => t.file)).toEqual([
      'DATA/MEDICINE.DBF',
      'BACKUP/MEDICINE.DBF',
    ]);
  });

  it('keeps an unreadable file in its place, next to the ones that were read', async () => {
    const fake = (async () =>
      Response.json({
        files: [
          {
            file: 'TEMP0001.DBF',
            ok: false,
            code: 'TOO_SHORT',
            message: 'A .DBF needs at least 33 bytes, got 0',
          },
          read('MEDICINE.DBF', 40),
        ],
      })) as typeof fetch;
    const r = await postInspect(
      'http://api',
      [
        { name: 'DATA/TEMP0001.DBF', bytes: new Uint8Array(0) },
        { name: 'DATA/MEDICINE.DBF', bytes: file('MEDICINE.DBF') },
      ],
      fake,
    );
    expect(r).toMatchObject({
      ok: true,
      files: [
        { file: 'DATA/TEMP0001.DBF', ok: false, message: 'A .DBF needs at least 33 bytes, got 0' },
        { file: 'DATA/MEDICINE.DBF', ok: true },
      ],
    });
  });

  it(`sends at most ${MAX_PREVIEW_FILES} files and says how many were left out`, async () => {
    let sent: FormData | undefined;
    const fake = (async (_url: string, init?: RequestInit) => {
      sent = init?.body as FormData;
      return Response.json({
        files: Array.from({ length: MAX_PREVIEW_FILES }, (_, i) => read(`T${i}.DBF`, 1)),
      });
    }) as typeof fetch;
    const many = Array.from({ length: MAX_PREVIEW_FILES + 7 }, (_, i) => ({
      name: `T${i}.DBF`,
      bytes: file('MEDICINE.DBF'),
    }));
    const r = await postInspect('http://api', many, fake);
    expect(sent!.getAll('files')).toHaveLength(MAX_PREVIEW_FILES);
    expect(r).toMatchObject({ ok: true, leftOut: 7 });
    expect(r.ok && r.files).toHaveLength(MAX_PREVIEW_FILES);
  });

  it("returns the API's message when the whole upload is refused", async () => {
    const fake = (async () =>
      Response.json(
        { error: 'TOO_LARGE', message: 'The upload is over 20 MB' },
        { status: 413 },
      )) as typeof fetch;
    expect(await postInspect('http://api', dbfs, fake)).toEqual({
      ok: false,
      message: 'The upload is over 20 MB',
    });
  });

  it('says the API is unreachable when fetch fails', async () => {
    const fake = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await postInspect('http://api', dbfs, fake)).toEqual({ ok: false, message: null });
  });
});
