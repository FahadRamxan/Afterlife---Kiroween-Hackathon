import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';
import { multipartBody } from './multipart-body';
import { safeFileName } from './uploads';

describe('safeFileName', () => {
  it('keeps the base name, and only plain characters', () => {
    expect(safeFileName('C:\\Users\\me\\shifa.zip')).toBe('shifa.zip');
    // The / in </b> is a path separator too: only what follows the last one is kept.
    expect(safeFileName('../../<b>x</b>.zip')).toBe('b .zip');
    expect(safeFileName('<script>my app.zip')).toBe('script my app.zip');
    expect(safeFileName('...')).toBe('upload.zip');
  });

  it('property: never a path, never a leading dot, at most 64 characters', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        const n = safeFileName(s);
        expect(n).not.toMatch(/[\\/<>:"|?*\0]/);
        expect(n.startsWith('.')).toBe(false);
        expect(n.length).toBeGreaterThan(0);
        expect(n.length).toBeLessThanOrEqual(64);
      }),
    );
  });
});

describe('POST /api/uploads without a database', () => {
  it('answers 503: an uploaded app has nowhere to be kept', async () => {
    const app = buildApp(parseEnv({}), { logger: false });
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/uploads',
        ...multipartBody([{ name: 'zip', filename: 'a.zip', bytes: new Uint8Array([1]) }]),
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error).toBe('NO_DATABASE');
    } finally {
      await app.close();
    }
  });
});
