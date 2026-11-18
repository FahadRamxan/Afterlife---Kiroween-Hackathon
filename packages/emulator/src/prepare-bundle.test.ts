import { strFromU8, unzipSync } from 'fflate';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BundleError, buildBundle, prepareBundle } from './bundle';

const bundle = buildBundle({
  executable: 'SHIFA.EXE',
  files: { 'SHIFA.EXE': new Uint8Array([0x4d, 0x5a]), 'MEDICINE.DBF': new Uint8Array([3, 1]) },
});
const conf = (b: Uint8Array) => strFromU8(unzipSync(b)['.jsdos/dosbox.conf']!);

describe('prepareBundle (boot options applied to a bundle)', () => {
  it('without options gives the same files and config', () => {
    const out = unzipSync(prepareBundle(bundle));
    expect(out).toEqual(unzipSync(bundle));
  });

  it('sets a fixed speed', () => {
    expect(conf(prepareBundle(bundle, { cycles: 50000 }))).toContain('cycles=fixed 50000');
    expect(conf(prepareBundle(bundle, { cycles: 50000 }))).not.toContain('cycles=fixed 20000');
  });

  it('sets the DOS clock before the program starts (DOSBox takes a four-digit year)', () => {
    const c = conf(prepareBundle(bundle, { dosTime: '2000-01-15 09:30:00' }));
    expect(c).toContain('mount c .\nc:\ntime 09:30:00\ndate 01-15-2000\nSHIFA.EXE\n');
  });

  it.each([
    '1998-7-15 10:00:00',
    '1998-02-30 10:00:00',
    '1998-07-15',
    '1979-12-31 10:00:00',
    '1998-07-15 25:00:00',
  ])('refuses the DOS time %j', (dosTime) => {
    expect(() => prepareBundle(bundle, { dosTime })).toThrow(BundleError);
  });

  it('replaces the drive files, keeping the config (for restoring a saved state)', () => {
    const out = unzipSync(
      prepareBundle(bundle, {
        files: { 'SHIFA.EXE': new Uint8Array([0x4d, 0x5a]), 'DATA/X.DBF': new Uint8Array([9]) },
      }),
    );
    expect(Object.keys(out).sort()).toEqual(['.jsdos/dosbox.conf', 'DATA/X.DBF', 'SHIFA.EXE']);
    expect(out['DATA/X.DBF']).toEqual(new Uint8Array([9]));
  });

  it('refuses something that is not a js-dos bundle', () => {
    expect(() => prepareBundle(new Uint8Array([1, 2, 3]))).toThrow(BundleError);
  });

  it('is repeatable: the same input gives the same bytes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 1_000_000 }), (cycles) => {
        expect(prepareBundle(bundle, { cycles })).toEqual(prepareBundle(bundle, { cycles }));
      }),
      { numRuns: 50 },
    );
  });
});
