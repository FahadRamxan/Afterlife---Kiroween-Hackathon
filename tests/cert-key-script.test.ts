// @spec rebirth-certificate#2.1 pnpm cert:key makes a signing key pair for a deploy (Prompt 71).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signingKey } from '@afterlife/certificate';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');

describe('pnpm cert:key', () => {
  it('is a root script', () => {
    expect(
      JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts['cert:key'],
    ).toBe('tsx scripts/cert-key.ts');
  });

  it('prints a new secret for the worker and its public key for the API, which match', async () => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/cert-key.ts'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    const secret = /^CERT_SIGNING_KEY=([0-9a-f]{64})$/m.exec(r.stdout)?.[1];
    const pub = /^CERT_PUBLIC_KEY=([0-9a-f]{64})$/m.exec(r.stdout)?.[1];
    expect(secret && pub).toBeTruthy();
    expect((await signingKey(secret!)).publicKey).toBe(pub);
    expect(r.stdout).toContain('worker only');
  });
});
