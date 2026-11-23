import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const envKeys = (p: string) =>
  read(p)
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => l.split('=')[0]);

describe('Dockerfiles (Prompt 10)', () => {
  it.each(['api', 'worker'])(
    'apps/%s/Dockerfile uses Node 22, runs as a non-root user and installs only its deps',
    (app) => {
      const d = read(`apps/${app}/Dockerfile`);
      expect(d).toMatch(/^FROM node:22/m);
      expect(d).toMatch(/^USER node$/m);
      expect(d).toContain(`--filter @afterlife/${app}...`);
      expect(d).toContain('--frozen-lockfile');
    },
  );

  it('.dockerignore keeps node_modules, builds and secrets out of the image', () => {
    const ignore = read('.dockerignore');
    for (const p of ['node_modules', '.next', '.env', '.git']) expect(ignore).toContain(p);
  });
});

describe('render.yaml (Prompt 10)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services = parse(read('render.yaml')).services as any[];

  it('defines the API as a Docker web service with a /health check', () => {
    const api = services.find((s) => s.name === 'afterlife-api');
    expect(api).toMatchObject({ type: 'web', runtime: 'docker', healthCheckPath: '/health' });
    expect(api.dockerfilePath).toBe('./apps/api/Dockerfile');
  });

  it('trusts the Render proxy for the client address, so per-IP rate limits work (Prompt 36)', () => {
    const api = services.find((s) => s.name === 'afterlife-api');
    expect(api.envVars).toContainEqual({ key: 'TRUST_PROXY', value: '1' });
  });

  it('defines the worker as a Docker background worker', () => {
    const w = services.find((s) => s.name === 'afterlife-worker');
    expect(w).toMatchObject({ type: 'worker', runtime: 'docker' });
  });

  it('never commits secret values', () => {
    for (const s of services)
      for (const e of s.envVars ?? [])
        if (/URL|KEY|SECRET/.test(e.key) && e.key !== 'WEB_ORIGINS') expect(e.sync).toBe(false);
  });
});

describe('worker image (Prompt 37)', () => {
  const dockerfile = read('apps/worker/Dockerfile');

  it('stays on Node 22 and installs Chromium with its system libraries, from the lockfile Playwright', () => {
    expect(dockerfile).toMatch(/^FROM node:22-/m);
    expect(dockerfile).toMatch(/exec playwright install --with-deps --only-shell chromium/);
    expect(dockerfile).toMatch(/PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
    expect(dockerfile).toMatch(/^USER node$/m);
  });

  it('has ClamAV with signatures, and uses it by default (Prompt 40)', () => {
    expect(dockerfile).toMatch(/apt-get install[^\n]*clamav/);
    expect(dockerfile).toMatch(/freshclam/);
    expect(dockerfile).toMatch(/VIRUS_SCANNER=clamav/);
    const smoke = read('scripts/docker-smoke.mjs');
    expect(smoke).toContain("'src/smoke-scan.ts'");
    expect(read('docs/deploy.md')).toMatch(/scan peaks at \d+ MiB/);
  });

  it('the Docker smoke test boots Shifa inside the image and the job loop on Postgres', () => {
    const smoke = read('scripts/docker-smoke.mjs');
    expect(smoke).toContain("'src/smoke-boot.ts'");
    expect(smoke).toMatch(/SMOKE BOOT OK 2/);
    expect(smoke).toMatch(/afterlife worker started/);
  });

  it('docs/deploy.md gives the measured memory of 2 emulators', () => {
    expect(read('docs/deploy.md')).toMatch(/2 Shifa emulators[^\n]*\d+ MiB/);
  });
});

describe('.env.example files (Prompt 10)', () => {
  it('API example lists every variable parseEnv reads, plus DATABASE_URL', () => {
    expect(envKeys('apps/api/.env.example').sort()).toEqual([
      'CERT_PUBLIC_KEY',
      'DATABASE_URL',
      'HOST',
      'LLM_TOKEN_BUDGET',
      'LOG_LEVEL',
      'PORT',
      'RATE_LIMIT_CREATE_PER_MINUTE',
      'RATE_LIMIT_PER_MINUTE',
      'SEANCE_STORAGE_MB',
      'TRUST_PROXY',
      'TWIN_READY_DAYS',
      'TWIN_READY_MATCHED',
      'TWIN_READY_MISMATCHES',
      'WEB_ORIGINS',
    ]);
  });
  it('web example sets the public API URL', () => {
    expect(envKeys('apps/web/.env.example')).toEqual(['NEXT_PUBLIC_API_URL']);
  });
  it('worker example sets DATABASE_URL', () => {
    expect(envKeys('apps/worker/.env.example')).toContain('DATABASE_URL');
  });
  it('worker example names the model settings, with no credentials in it (Prompt 47)', () => {
    expect(envKeys('apps/worker/.env.example')).toEqual(
      expect.arrayContaining(['LLM_PROVIDER', 'AWS_REGION', 'LLM_TOKEN_BUDGET']),
    );
    expect(read('apps/worker/.env.example')).not.toMatch(/^AWS_(ACCESS|SECRET)/m);
  });
  it('.gitignore ignores real .env files but not the examples', () => {
    const gi = read('.gitignore');
    expect(gi).toMatch(/^\.env$/m);
    expect(gi).not.toMatch(/^\.env\.example$/m);
  });
});

describe('prod smoke workflow (Prompt 10)', () => {
  const wf = parse(read('.github/workflows/prod-smoke.yml'));
  it('is manual and takes the production URL', () => {
    expect(wf.on.workflow_dispatch.inputs.url).toBeDefined();
  });
  it('passes the URL through env, not shell interpolation', () => {
    const job = Object.values(wf.jobs)[0] as {
      steps: { run?: string; env?: Record<string, string> }[];
    };
    const step = job.steps.find((s) => s.run?.includes('playwright test'))!;
    expect(step.env?.BASE_URL).toContain('inputs.url');
    expect(step.run).not.toContain('${{');
  });
});

describe('docs/deploy.md (Prompt 10)', () => {
  const doc = read('docs/deploy.md');
  it.each([
    'Vercel',
    'Render',
    'Neon',
    'NEXT_PUBLIC_API_URL',
    'WEB_ORIGINS',
    '/health',
    'prod-smoke',
  ])('mentions %s', (s) => {
    expect(doc).toContain(s);
  });
});
