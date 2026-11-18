// Apps get drizzle-orm through @afterlife/db. pnpm can install two copies of drizzle-orm (one per
// set of optional peers, pg-boss brings @opentelemetry/api), and a query helper from one copy
// does not type-check against a schema from the other (found in Prompt 37).
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
    const p = join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('drizzle-orm in the apps', () => {
  it('no app imports drizzle-orm directly or depends on it', () => {
    for (const app of ['api', 'worker', 'web']) {
      const dir = join(ROOT, 'apps', app);
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      expect({ ...pkg.dependencies, ...pkg.devDependencies }, app).not.toHaveProperty(
        'drizzle-orm',
      );
      const bad = sources(join(dir, app === 'web' ? 'lib' : 'src')).filter((f) =>
        /from 'drizzle-orm/.test(readFileSync(f, 'utf8')),
      );
      expect(bad, app).toEqual([]);
    }
  });
});
