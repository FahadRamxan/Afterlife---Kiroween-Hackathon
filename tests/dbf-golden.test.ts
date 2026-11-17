// Prompt 18 golden test. samples/graveyard/golden/<app>/*.DBF are written by @afterlife/dbf from the
// seed CSVs, without the C csv2dbf tool. pnpm graveyard:test runs every DOS scenario on them in
// DOSBox and requires the same screens and data as the normal run.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { goldenFiles } from '../scripts/dbf-golden';
import { GRAVEYARD } from './helpers/graveyard';

describe('golden DBFs written by the TypeScript writer', () => {
  const fresh = goldenFiles();

  it('cover every data file of the three apps', () => {
    expect(Object.keys(fresh).sort()).toEqual(
      ['barkat', 'iqra', 'shifa'].flatMap((app) =>
        readdirSync(resolve(GRAVEYARD, 'dist', app))
          .filter((f) => f.endsWith('.DBF'))
          .map((f) => `${app}/${f}`),
      ),
    );
  });

  it.each(Object.keys(fresh))('%s is committed and up to date (pnpm dbf:golden)', (path) => {
    const file = resolve(GRAVEYARD, 'golden', path);
    expect(existsSync(file), 'run pnpm dbf:golden').toBe(true);
    expect(new Uint8Array(readFileSync(file))).toEqual(fresh[path]);
  });

  it.each(Object.keys(fresh))('%s is byte-identical to the file the C library wrote', (path) => {
    expect(fresh[path]).toEqual(new Uint8Array(readFileSync(resolve(GRAVEYARD, 'dist', path))));
  });

  it('the DOSBox run on the golden files is part of pnpm graveyard:test', () => {
    const sh = readFileSync(resolve(GRAVEYARD, 'toolchain/test.sh'), 'utf8');
    expect(sh).toContain('golden');
    expect(sh).toMatch(/golden.*differ/s);
  });
});
