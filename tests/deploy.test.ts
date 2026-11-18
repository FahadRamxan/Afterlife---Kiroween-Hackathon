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

describe('.env.example files (Prompt 10)', () => {
  it('API example lists every variable parseEnv reads, plus DATABASE_URL', () => {
    expect(envKeys('apps/api/.env.example').sort()).toEqual([
      'DATABASE_URL',
      'HOST',
      'LOG_LEVEL',
      'PORT',
      'TRUST_PROXY',
      'WEB_ORIGINS',
    ]);
  });
  it('web example sets the public API URL', () => {
    expect(envKeys('apps/web/.env.example')).toEqual(['NEXT_PUBLIC_API_URL']);
  });
  it('worker example sets DATABASE_URL', () => {
    expect(envKeys('apps/worker/.env.example')).toContain('DATABASE_URL');
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
