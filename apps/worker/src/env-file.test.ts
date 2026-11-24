// @spec claude-api#1.2 The worker and the API read their .env file (Prompt 80a): both examples say
// to copy it, and before this nothing loaded it.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
const ROOT = path.resolve(__dirname, '../../..');
const FLAG = '--env-file-if-exists=.env';
/** tsx, found from the worker (the test runs node in a folder with only a .env in it). */
const TSX = pathToFileURL(createRequire(__filename).resolve('tsx')).href;
const scripts = (app: string) =>
  (
    JSON.parse(readFileSync(path.join(ROOT, 'apps', app, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts;
describe('.env files', () => {
  it.each(['worker', 'api'])('the %s loads its .env when it runs, and runs without one', (app) => {
    const s = scripts(app);
    expect(s.start).toContain(FLAG);
    expect(s.dev).toContain(FLAG);
  });
  it("a value set only in .env reaches the worker's model settings", () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'afterlife-env-'));
    try {
      writeFileSync(
        path.join(dir, '.env'),
        'LLM_PROVIDER=anthropic\nANTHROPIC_API_KEY=sk-from-env-file\n',
      );
      // The same flag as the scripts, from the folder with the .env, as `pnpm start` runs.
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([k]) => !/^(LLM_|ANTHROPIC_|NODE_OPTIONS|VITEST)/.test(k),
        ),
      );
      const out = execFileSync(
        process.execPath,
        ['--import', TSX, FLAG, path.join(__dirname, 'testing/env-probe.ts')],
        {
          cwd: dir,
          env: { ...env, NODE_PATH: path.join(ROOT, 'apps/worker/node_modules') },
          encoding: 'utf8',
        },
      );
      expect(out.trim()).toBe('anthropic claude-sonnet-5-5');
      // The key is never printed.
      expect(out).not.toContain('sk-from-env-file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
