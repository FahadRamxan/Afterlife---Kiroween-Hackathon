// @spec code-export#1 The export's contents.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SoulSchema } from '@afterlife/soul';
import fc from 'fast-check';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { RUNTIME_PACKAGES, buildExport, exportZip, vendorRuntime } from './export';
import { SHIFA, SHIFA_FILES, shifaSeed } from './testing/shifa';

const PACKAGES = resolve(__dirname, '../..');
/** The runtime's real source, as the API reads it (apps/api/src/export.ts). */
function sources() {
  const out: Record<string, Record<string, string>> = {};
  for (const pkg of [...RUNTIME_PACKAGES, 'screen'] as const) {
    out[pkg] = {};
    for (const f of readdirSync(resolve(PACKAGES, pkg, 'src')))
      if (f.endsWith('.ts')) out[pkg]![f] = readFileSync(resolve(PACKAGES, pkg, 'src', f), 'utf8');
  }
  return out;
}
const SEED = Object.fromEntries(SHIFA_FILES.map((f) => [f, shifaSeed(f).records]));
const files = () => buildExport({ soul: SHIFA, records: SEED, runtime: vendorRuntime(sources()) });

/** The relative imports of a source file, resolved against the export's files. */
function imports(path: string, text: string): string[] {
  const dir = path.split('/').slice(0, -1);
  return [...text.matchAll(/from '(\.[^']+)'/g)].map((m) => {
    const parts = [...dir];
    for (const p of m[1]!.split('/')) {
      if (p === '..') parts.pop();
      else if (p !== '.') parts.push(p);
    }
    return parts.join('/');
  });
}

describe('vendorRuntime', () => {
  // @spec code-export#1.1
  it('copies the runtime with no import of our packages, and without tests or stores', () => {
    const v = vendorRuntime(sources());
    for (const [path, text] of Object.entries(v)) {
      expect(text, path).not.toMatch(/from '@afterlife\//);
      expect(path).not.toMatch(
        /\.test\.ts$|postgres|indexeddb|cli\.ts|arbitrary|node\.ts$|export\.ts$/,
      );
    }
    expect(v['lib/afterlife/vessel/runtime.ts']).toContain("from '../soul'");
    expect(v['lib/afterlife/dbf/reader.ts']).toContain("from '../screen'");
    // Only the code page table of the screen package: not its decoder.
    expect(Object.keys(v).filter((p) => p.startsWith('lib/afterlife/screen/'))).toEqual([
      'lib/afterlife/screen/index.ts',
    ]);
  });

  it('every relative import names a file the export has (invariant)', () => {
    const v = vendorRuntime(sources());
    const has = (p: string) =>
      [`${p}.ts`, `${p}/index.ts`, `${p}.json`].some((x) => x in v) || p in v;
    for (const [path, text] of Object.entries(v))
      for (const target of imports(path, text))
        expect(has(target), `${path} → ${target}`).toBe(true);
  });

  it('rewrites any package import, whatever else the file says (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('soul', 'dbf', 'screen'),
        fc.string({ unit: fc.constantFrom(...'ab \n;'), maxLength: 20 }),
        (pkg, rest) => {
          const v = vendorRuntime({
            vessel: { 'x.ts': `${rest}\nimport { a } from '@afterlife/${pkg}';\n${rest}` },
            screen: { 'cp437.ts': 'export const a = 1;' },
          });
          expect(v['lib/afterlife/vessel/x.ts']).toBe(
            `${rest}\nimport { a } from '../${pkg}';\n${rest}`,
          );
        },
      ),
    );
  });
});

describe('buildExport', () => {
  // @spec code-export#1.2
  it('a Next.js app, its Soul and seed, the Kiro files and the test suite', () => {
    const f = files();
    for (const p of [
      'package.json',
      'tsconfig.json',
      'next.config.mjs',
      'next-env.d.ts',
      'vitest.config.mts',
      'README.md',
      '.gitignore',
      'app/layout.tsx',
      'app/page.tsx',
      'app/reborn-app.tsx',
      'lib/reborn.ts',
      'lib/seed.ts',
      'soul.json',
      'data/MEDICINE.json',
      'data/BILLS.json',
      'tests/soul.test.ts',
      'tests/runtime.prop.test.ts',
      '.kiro/specs/shifa-rebirth/requirements.md',
      '.kiro/specs/shifa-rebirth/design.md',
      '.kiro/specs/shifa-rebirth/tasks.md',
      '.kiro/steering/legacy-behaviour.md',
      'lib/afterlife/vessel/runtime.ts',
    ])
      expect(f, p).toHaveProperty([p]);
    const pkg = JSON.parse(f['package.json']!);
    expect(pkg.name).toBe('shifa-reborn');
    expect(pkg.scripts.test).toBe('tsc --noEmit && vitest run');
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ['decimal.js', 'fflate', 'next', 'react', 'react-dom', 'zod'].sort(),
    );
  });

  it('round-trips its Soul and its seed records (round trip)', () => {
    const f = files();
    expect(SoulSchema.parse(JSON.parse(f['soul.json']!))).toEqual(SHIFA);
    for (const file of SHIFA_FILES)
      expect(JSON.parse(f[`data/${file.replace(/\.DBF$/i, '')}.json`]!)).toEqual(SEED[file]);
    expect(f['lib/seed.ts']).toContain("'MEDICINE.DBF': MEDICINE");
  });

  it('every source file’s relative imports name files of the export (invariant)', () => {
    const f = files();
    const has = (p: string) =>
      [`${p}.ts`, `${p}.tsx`, `${p}/index.ts`, `${p}.json`].some((x) => x in f) || p in f;
    for (const [path, text] of Object.entries(f))
      if (/\.(ts|tsx|mts)$/.test(path))
        for (const t of imports(path, text)) expect(has(t), `${path} → ${t}`).toBe(true);
  });

  it('zips under one folder named after the app', () => {
    const zip = unzipSync(exportZip(files(), 'shifa-reborn'));
    expect(Object.keys(zip).every((p) => p.startsWith('shifa-reborn/'))).toBe(true);
    expect(strFromU8(zip['shifa-reborn/soul.json']!)).toBe(files()['soul.json']);
  });
});
