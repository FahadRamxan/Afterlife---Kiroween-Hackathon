import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (p: string) => JSON.parse(read(p)) as Record<string, any>;

const apps = ['web', 'api', 'worker'];
const packages = [
  'soul',
  'vessel',
  'dbf',
  'screen',
  'emulator',
  'oracle',
  'crew',
  'certificate',
  'mcp-emulator',
  'ui',
];
const topLevel = ['powers/afterlife', 'samples/graveyard', 'e2e', 'docs'];

describe('monorepo scaffold (Prompt 1)', () => {
  it('has a pnpm workspace and turbo config', () => {
    const ws = read('pnpm-workspace.yaml');
    for (const g of ['apps/*', 'packages/*']) expect(ws).toContain(g);
    expect(existsSync(resolve(root, 'turbo.json'))).toBe(true);
  });

  it('is named afterlife and defines every root script', () => {
    const pkg = json('package.json');
    expect(pkg.name).toBe('afterlife');
    for (const s of ['dev', 'build', 'test', 'e2e', 'lint', 'typecheck', 'verify']) {
      expect(pkg.scripts, `missing script ${s}`).toHaveProperty(s);
    }
  });

  it('verify runs lint, typecheck, test and e2e', () => {
    const verify: string = json('package.json').scripts.verify;
    for (const s of ['lint', 'typecheck', 'test', 'e2e']) expect(verify).toContain(s);
  });

  it.each(apps)('apps/%s exists as a workspace package', (a) => {
    expect(json(`apps/${a}/package.json`).name).toBe(`@afterlife/${a}`);
  });

  it.each(packages)('packages/%s exists as a workspace package', (p) => {
    expect(json(`packages/${p}/package.json`).name).toBe(`@afterlife/${p}`);
    expect(existsSync(resolve(root, `packages/${p}/src/index.ts`))).toBe(true);
  });

  it.each(topLevel)('%s folder exists', (d) => {
    expect(existsSync(resolve(root, d))).toBe(true);
  });

  it('tsconfig.base.json is strict, ES2022 and aliases @afterlife/*', () => {
    const cfg = json('tsconfig.base.json').compilerOptions;
    expect(cfg.strict).toBe(true);
    expect(String(cfg.target).toLowerCase()).toBe('es2022');
    expect(Object.keys(cfg.paths)).toContain('@afterlife/*');
  });

  it('has ESLint flat config and Prettier config', () => {
    expect(existsSync(resolve(root, 'eslint.config.mjs'))).toBe(true);
    expect(existsSync(resolve(root, '.prettierrc.json'))).toBe(true);
  });

  it('has an MIT LICENSE for Matrix AE', () => {
    const lic = read('LICENSE');
    expect(lic).toContain('MIT License');
    expect(lic).toContain('Matrix AE');
  });

  it('has a README', () => {
    expect(read('README.md').length).toBeGreaterThan(100);
  });

  it('.gitignore does not ignore .kiro', () => {
    const lines = read('.gitignore')
      .split(/\r?\n/)
      .map((l) => l.trim());
    expect(lines.some((l) => /^\/?\.kiro\/?\*?$/.test(l))).toBe(false);
  });
});
