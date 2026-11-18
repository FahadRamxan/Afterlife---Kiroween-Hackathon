import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dbfPreviewBytes, writeDbf, type DbfRecord } from '@afterlife/dbf';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { InspectResponse, MAX_FILES, MAX_INSPECT_BYTES } from './dbf-inspect';
import { parseEnv } from './env';

const DIST = resolve(__dirname, '../../../samples/graveyard/dist');
const sample = (p: string) => new Uint8Array(readFileSync(resolve(DIST, p)));

const app = buildApp(parseEnv({ WEB_ORIGINS: 'https://afterlife.example' }), { logger: false });
beforeAll(() => app.ready());
afterAll(() => app.close());

/** A real multipart/form-data body, serialised by the platform's own FormData. */
async function multipart(files: [string, Uint8Array][], fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const [name, bytes] of files) form.append('files', new Blob([bytes]), name);
  const req = new Request('http://localhost/', { method: 'POST', body: form });
  return {
    payload: Buffer.from(await req.arrayBuffer()),
    headers: { 'content-type': req.headers.get('content-type')! },
  };
}

async function inspect(files: [string, Uint8Array][], fields: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/dbf/inspect',
    ...(await multipart(files, fields)),
  });
}

/** The n-th file of an answer; it must have been read. */
function table(json: unknown, n = 0) {
  const f = InspectResponse.parse(json).files[n]!;
  if (!f.ok) throw new Error(`${f.file} was not read: ${f.message}`);
  return f;
}

describe('POST /api/dbf/inspect', () => {
  it('returns the schema and rows of the real Shifa MEDICINE.DBF', async () => {
    const res = await inspect([['MEDICINE.DBF', sample('shifa/MEDICINE.DBF')]]);
    expect(res.statusCode).toBe(200);
    expect(InspectResponse.parse(res.json()).files).toHaveLength(1);
    const t = table(res.json());
    expect(t.file).toBe('MEDICINE.DBF');
    expect(t.recordCount).toBe(40);
    expect(t.fields[0]).toEqual({ name: 'CODE', type: 'C', length: 6, decimals: 0 });
    expect(t.rows).toHaveLength(40);
    expect(t.rows[0]!.values).toMatchObject({ CODE: 'PAN500', NAME: 'PANADOL 500MG STRIP' });
  });

  it('inspects several files in the order they were sent', async () => {
    const res = await inspect([
      ['BILLS.DBF', sample('shifa/BILLS.DBF')],
      ['STUDENT.DBF', sample('iqra/STUDENT.DBF')],
    ]);
    expect(res.statusCode).toBe(200);
    expect(InspectResponse.parse(res.json()).files.map((t) => t.file)).toEqual([
      'BILLS.DBF',
      'STUDENT.DBF',
    ]);
  });

  it('returns the first 100 rows of a bigger table and counts the rest', async () => {
    const big = writeDbf({
      fields: [{ name: 'N', type: 'N', length: 5, decimals: 0 }],
      records: Array.from({ length: 250 }, (_, i): DbfRecord => ({
        deleted: false,
        values: { N: String(i) },
      })),
    });
    const t = table((await inspect([['BIG.DBF', big]])).json());
    expect(t.rows).toHaveLength(100);
    expect(t.moreRows).toBe(150);
  });

  it('passes on the reader warning for a file that was cut short', async () => {
    const bytes = sample('shifa/MEDICINE.DBF');
    const t = table(
      (await inspect([['MEDICINE.DBF', bytes.subarray(0, bytes.length - 30)]])).json(),
    );
    expect(t.recordCount).toBe(39);
    expect(t.warnings[0]).toMatchObject({ code: 'TRUNCATED' });
  });

  it('a file that is not a .DBF is an error in its own place, with the reason', async () => {
    const res = await inspect([['SHIFA.DBF', sample('shifa/SHIFA.EXE')]]);
    expect(res.statusCode).toBe(200);
    expect(InspectResponse.parse(res.json()).files).toEqual([
      {
        file: 'SHIFA.DBF',
        ok: false,
        code: 'BAD_VERSION',
        message: expect.stringContaining('0x4d'),
      },
    ]);
  });

  it('a file whose name is not .DBF is an error in its own place', async () => {
    const res = await inspect([['SHIFA.EXE', sample('shifa/SHIFA.EXE')]]);
    expect(InspectResponse.parse(res.json()).files).toEqual([
      { file: 'SHIFA.EXE', ok: false, code: 'NOT_DBF', message: 'SHIFA.EXE is not a .DBF file' },
    ]);
  });

  it('one empty or broken DBF does not hide the others (a real shop folder)', async () => {
    const res = await inspect([
      ['BILLS.DBF', sample('shifa/BILLS.DBF')],
      ['TEMP0001.DBF', new Uint8Array(0)],
      ['MEDICINE.DBF', sample('shifa/MEDICINE.DBF')],
    ]);
    expect(res.statusCode).toBe(200);
    const files = InspectResponse.parse(res.json()).files;
    expect(files.map((f) => [f.file, f.ok])).toEqual([
      ['BILLS.DBF', true],
      ['TEMP0001.DBF', false],
      ['MEDICINE.DBF', true],
    ]);
    expect(files[1]).toMatchObject({
      code: 'TOO_SHORT',
      message: 'A .DBF needs at least 33 bytes, got 0',
    });
    expect(table(res.json(), 2).recordCount).toBe(40);
  });

  it('with cut=100, a file cut to its first 100 records counts them all and does not warn', async () => {
    const big = writeDbf({
      fields: [{ name: 'N', type: 'N', length: 5, decimals: 0 }],
      records: Array.from({ length: 3000 }, (_, i): DbfRecord => ({
        deleted: false,
        values: { N: String(i) },
      })),
    });
    const t = table(
      (await inspect([['BIG.DBF', dbfPreviewBytes(big, 100)]], { cut: '100' })).json(),
    );
    expect(t.recordCount).toBe(3000);
    expect(t.rows).toHaveLength(100);
    expect(t.moreRows).toBe(2900);
    expect(t.warnings).toEqual([]);
  });

  it.each([
    ['cut', '0'],
    ['cut', 'lots'],
    ['cut', '5000'],
    ['note', 'hello'],
  ])('refuses the form field %s=%s with a typed 400', async (name, value) => {
    const res = await inspect([['MEDICINE.DBF', sample('shifa/MEDICINE.DBF')]], { [name]: value });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'NOT_A_FILE' });
  });

  it('answers 400 when no file is sent', async () => {
    const res = await inspect([]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'NO_FILES' });
  });

  it('answers 413 above 20 MB in total', async () => {
    const half = new Uint8Array(MAX_INSPECT_BYTES / 2 + 1);
    const res = await inspect([
      ['A.DBF', half],
      ['B.DBF', half],
    ]);
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: 'TOO_LARGE' });
  });

  it(`answers a typed 413 for more than ${MAX_FILES} files`, async () => {
    const medicine = sample('shifa/MEDICINE.DBF');
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i): [string, Uint8Array] => [
      `M${i}.DBF`,
      medicine,
    ]);
    const res = await inspect(files);
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({
      error: 'TOO_MANY_FILES',
      message: `Send at most ${MAX_FILES} .DBF files at once`,
    });
  });

  it('answers a typed 400 for a form field that is not a file', async () => {
    const form = new FormData();
    form.append('note', 'hello');
    form.append('files', new Blob([sample('shifa/MEDICINE.DBF')]), 'MEDICINE.DBF');
    const req = new Request('http://localhost/', { method: 'POST', body: form });
    const res = await app.inject({
      method: 'POST',
      url: '/api/dbf/inspect',
      payload: Buffer.from(await req.arrayBuffer()),
      headers: { 'content-type': req.headers.get('content-type')! },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'NOT_A_FILE' });
  });

  it('answers 200, with lastUpdate null, for a header date that is not a real date', async () => {
    // Was a 500 with the zod issue list in the message ("1998-200-01" failed the response schema).
    const bytes = sample('shifa/MEDICINE.DBF').slice();
    bytes[2] = 200;
    const res = await inspect([['MEDICINE.DBF', bytes]]);
    expect(res.statusCode).toBe(200);
    const t = table(res.json());
    expect(t.lastUpdate).toBeNull();
    expect(t.recordCount).toBe(40);
  });

  it('answers 415 for a body that is not multipart', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dbf/inspect',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(415);
  });

  it('allows the web origin to call it (CORS preflight)', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/dbf/inspect',
      headers: {
        origin: 'https://afterlife.example',
        'access-control-request-method': 'POST',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://afterlife.example');
  });
});
