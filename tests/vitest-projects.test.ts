// Tests that drive the real js-dos run last, alone, one file at a time. Run next to 2,000-case
// property tests they were starved of CPU, and a starved DOS app drops typed keys (ci:local saw
// the determinism test take 592 s instead of 42 s and lose "N500{Enter}1{Enter}").
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestProjectInlineConfiguration } from 'vitest/config';

const ROOT = resolve(__dirname, '..');

/** Every test file under packages/ and apps/ (not node_modules), as repo-relative paths. */
function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const p = join(dir, e.name);
    if (e.isDirectory()) return testFiles(p);
    return /\.test\.tsx?$/.test(e.name) ? [relative(ROOT, p).replaceAll('\\', '/')] : [];
  });
}

/** A test that boots real js-dos: a HeadlessPool or HeadlessJsDos, or the MCP server process. */
const usesRealEmulator = (file: string) =>
  /new HeadlessPool|new HeadlessJsDos|chromium\.launch|resolve\(__dirname, 'main\.ts'\)/.test(
    readFileSync(join(ROOT, file), 'utf8'),
  );

describe('vitest projects', () => {
  it('runs the real-emulator tests in their own project, after the rest, one file at a time', async () => {
    const root = (await import('../vitest.config.mts')).default;
    const projects = root.test!.projects! as (string | TestProjectInlineConfiguration)[];
    const emulator = projects.find(
      (p): p is TestProjectInlineConfiguration =>
        typeof p !== 'string' && p.test?.name === 'emulator',
    );
    expect(emulator, 'an "emulator" project in vitest.config.mts').toBeDefined();
    expect(emulator!.test!.fileParallelism).toBe(false);
    expect(emulator!.test!.sequence?.groupOrder).toBeGreaterThan(0);
  });

  it('every test file that boots real js-dos is named so the emulator project picks it up', async () => {
    const { isEmulatorTest } = await import('../vitest.shared.mts');
    const files = [...testFiles(join(ROOT, 'packages')), ...testFiles(join(ROOT, 'apps'))];
    const real = files.filter(usesRealEmulator);
    // Not vacuous: the worker and the MCP server both have real-emulator tests.
    expect(real.length).toBeGreaterThanOrEqual(4);
    expect(real.filter((f) => !isEmulatorTest(f))).toEqual([]);
    // And the fast suite keeps its own tests: no plain unit test is moved to the slow group.
    expect(files.filter((f) => isEmulatorTest(f) && !usesRealEmulator(f))).toEqual([]);
  });

  it('package configs leave real-emulator tests out when run from the root, and keep them alone', async () => {
    const { sharedConfig, EMULATOR_TESTS } = await import('../vitest.shared.mts');
    expect(sharedConfig({ fromRoot: true }).test!.exclude).toEqual(
      expect.arrayContaining(EMULATOR_TESTS),
    );
    // `pnpm --filter @afterlife/worker test` still runs them.
    expect(sharedConfig({ fromRoot: false }).test!.exclude ?? []).not.toEqual(
      expect.arrayContaining(EMULATOR_TESTS),
    );
  });
});
