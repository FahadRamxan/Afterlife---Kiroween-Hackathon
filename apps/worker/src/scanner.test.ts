import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { EICAR, EicarTestScanner, parseClamscan, scannerFromEnv } from './scanner';

describe('parseClamscan', () => {
  it('exit 0 is clean, exit 1 names what it found, anything else is an error', () => {
    expect(parseClamscan(0, 'stdin: OK\n')).toEqual({ clean: true });
    expect(parseClamscan(1, 'stdin: Win.Test.EICAR_HDB-1 FOUND\n')).toEqual({
      clean: false,
      finding: 'Win.Test.EICAR_HDB-1',
    });
    expect(() =>
      parseClamscan(2, 'LibClamAV Error: cli_loaddb(): No supported database files found'),
    ).toThrow(/scanner failed/);
  });

  it('an "infected" exit without a FOUND line still counts as infected', () => {
    expect(parseClamscan(1, '')).toEqual({ clean: false, finding: 'unknown' });
  });
});

describe('EicarTestScanner (test scanner, EICAR only)', () => {
  const scanner = new EicarTestScanner();

  it('finds the EICAR test file inside a zip, and says it is only a test scanner', async () => {
    expect(scanner.name).toMatch(/test scanner.*EICAR only/i);
    const dirty = zipSync({ 'A.TXT': strToU8(EICAR), 'B.DBF': new Uint8Array([3]) });
    expect(await scanner.scan(dirty)).toEqual({ clean: false, finding: 'EICAR-Test-File' });
  });

  it('passes a zip without it', async () => {
    expect(await scanner.scan(zipSync({ 'B.DBF': new Uint8Array([3, 1, 2]) }))).toEqual({
      clean: true,
    });
  });
});

describe('scannerFromEnv', () => {
  it('is ClamAV unless the test scanner is asked for by name', () => {
    expect(scannerFromEnv({}).name).toMatch(/^ClamAV/);
    expect(scannerFromEnv({ VIRUS_SCANNER: 'eicar-test' }).name).toMatch(/test scanner/);
    expect(() => scannerFromEnv({ VIRUS_SCANNER: 'none' })).toThrow(/VIRUS_SCANNER/);
  });
});
