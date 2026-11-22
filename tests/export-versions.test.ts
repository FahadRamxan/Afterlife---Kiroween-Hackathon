// @spec code-export#1.2 The export depends on the versions this repo is tested with (Prompt 62).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { EXPORT_VERSIONS } from '../packages/vessel/src/export';
import { describe, expect, it } from 'vitest';

// Resolved from the web app, which uses all of them (Next.js, React) or has them installed.
const fromWeb = createRequire(resolve(__dirname, '../apps/web/package.json'));
const fromVessel = createRequire(resolve(__dirname, '../packages/vessel/package.json'));
const installed = (name: string) => {
  for (const req of [fromWeb, fromVessel, createRequire(__filename)])
    try {
      return (
        JSON.parse(readFileSync(req.resolve(`${name}/package.json`), 'utf8')) as {
          version: string;
        }
      ).version;
    } catch {
      // Not installed where this one looks.
    }
  return null;
};

describe('the export’s dependency versions', () => {
  it('are the versions installed in this repo', () => {
    for (const [name, version] of Object.entries({
      ...EXPORT_VERSIONS.dependencies,
      ...EXPORT_VERSIONS.devDependencies,
    }))
      expect(installed(name), name).toBe(version);
  });
});
