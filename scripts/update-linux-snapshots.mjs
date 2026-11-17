#!/usr/bin/env node
// Regenerates the Linux Playwright screenshot baselines used by CI, inside the official
// Playwright image, so fonts and rendering match GitHub Actions. Works on Windows, macOS, Linux.
// Usage: pnpm snapshots:linux [spec-file]
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = process.cwd();
const spec = process.argv[2] ?? '';
const require = createRequire(path.join(root, 'e2e/package.json'));
const { version } = require('@playwright/test/package.json');

const inner = [
  'set -e',
  'mkdir /work && cd /src',
  'tar --exclude=node_modules --exclude=.next --exclude=.turbo --exclude=coverage -cf - . | (cd /work && tar -xf -)',
  'cd /work && npm install -g --silent pnpm@10.5.2 && pnpm install --frozen-lockfile > /dev/null',
  `cd e2e && pnpm exec playwright test ${spec} --grep snapshot --update-snapshots`,
  "for d in $(find . -type d -name '*-snapshots' -not -path '*/node_modules/*'); do mkdir -p /out/$d && cp $d/*-linux.png /out/$d/; done",
].join('\n');

const r = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '-v',
    `${root}:/src:ro`,
    '-v',
    `${path.join(root, 'e2e')}:/out`,
    '-e',
    'CI=1',
    `mcr.microsoft.com/playwright:v${version}-noble`,
    'bash',
    '-c',
    inner,
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
