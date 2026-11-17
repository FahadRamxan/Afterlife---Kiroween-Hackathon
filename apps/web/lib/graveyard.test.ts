import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findApp, loadCatalog, storyLines } from './graveyard';
import { MAX_UPLOAD_BYTES, checkUpload } from './upload';

describe('loadCatalog', () => {
  const catalog = loadCatalog();

  it('has the three dead apps in Graveyard order, pharmacy first', () => {
    expect(catalog.apps.map((a) => a.id)).toEqual(['shifa', 'iqra', 'barkat']);
  });

  it('every app has born-died years, a story, a bundle and a 25-line preview', () => {
    for (const a of catalog.apps) {
      expect(a.died).toBeGreaterThanOrEqual(a.born);
      expect(storyLines(a.story).length).toBeGreaterThanOrEqual(2);
      expect(a.bundle).toBe(`/graveyard/${a.id}.jsdos`);
      expect(a.preview).toHaveLength(25);
    }
  });

  it('carries the honest disclosure', () => {
    expect(catalog.disclosure).toMatch(/written by our team/);
  });
});

describe('storyLines', () => {
  it('splits the era story into its lines', () => {
    expect(storyLines('one\ntwo\nthree')).toEqual(['one', 'two', 'three']);
    expect(storyLines('one\n\ntwo\n')).toEqual(['one', 'two']);
  });
});

describe('checkUpload', () => {
  it('accepts a zip file', () => {
    expect(checkUpload({ name: 'myapp.zip', size: 1234 })).toEqual({ ok: true });
    expect(checkUpload({ name: 'OLD-APP.ZIP', size: 1 })).toEqual({ ok: true });
  });

  it.each([
    [{ name: 'app.exe', size: 100 }, 'not-zip'],
    [{ name: 'app.zip.exe', size: 100 }, 'not-zip'],
    [{ name: 'app.zip', size: 0 }, 'empty'],
    [{ name: 'app.zip', size: MAX_UPLOAD_BYTES + 1 }, 'too-big'],
  ] as const)('rejects %j as %s', (file, reason) => {
    expect(checkUpload(file)).toEqual({ ok: false, reason });
  });

  it('the limit is 20 MB, as the inspect API will enforce', () => {
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
  });

  it('property: a .zip is accepted exactly when 1 <= size <= 20 MB', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 * MAX_UPLOAD_BYTES }), (size) => {
        expect(checkUpload({ name: 'a.zip', size }).ok).toBe(size >= 1 && size <= MAX_UPLOAD_BYTES);
      }),
    );
  });
});

describe('findApp (Raise page)', () => {
  it('finds each Graveyard app by id, with its real name', () => {
    expect(findApp('shifa')?.name).toBe('Shifa Medical Store');
    expect(findApp('iqra')?.name).toBe('Iqra School Fees');
    expect(findApp('barkat')?.name).toBe('Barkat Kiryana Ledger');
  });

  it('returns undefined for any id that is not in the catalogue', () => {
    const ids = new Set(loadCatalog().apps.map((a) => a.id));
    fc.assert(
      fc.property(fc.string(), (id) => {
        fc.pre(!ids.has(id));
        expect(findApp(id)).toBeUndefined();
      }),
    );
  });
});
