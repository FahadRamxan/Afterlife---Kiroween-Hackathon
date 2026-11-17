import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wf = (p: string) => parse(read(p)) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stepText = (job: any) => JSON.stringify(job.steps);

describe('CI workflow (Prompt 6)', () => {
  const ci = wf('.github/workflows/ci.yml');

  it('runs on pull requests and pushes to main', () => {
    expect(ci.on.pull_request).not.toBeUndefined();
    expect(ci.on.push.branches).toEqual(['main']);
  });

  it('every job uses Node 22 with the pnpm cache', () => {
    for (const job of Object.values(ci.jobs)) {
      const s = stepText(job);
      expect(s).toContain('pnpm/action-setup');
      expect(s).toMatch(/"node-version":"?22/);
      expect(s).toContain('"cache":"pnpm"');
      expect(s).toContain('pnpm install --frozen-lockfile');
    }
  });

  it('has lint, typecheck and test jobs', () => {
    expect(stepText(ci.jobs.lint)).toContain('pnpm lint');
    expect(stepText(ci.jobs.typecheck)).toContain('pnpm typecheck');
    expect(stepText(ci.jobs.test)).toContain('pnpm test:coverage');
  });

  it('uploads the coverage report as an artifact and writes a summary', () => {
    const s = stepText(ci.jobs.test);
    expect(s).toContain('actions/upload-artifact');
    expect(s).toContain('coverage');
    expect(s).toContain('GITHUB_STEP_SUMMARY');
  });

  it('runs Playwright e2e against a production build with Postgres 16', () => {
    const e2e = ci.jobs.e2e;
    expect(e2e.services.postgres.image).toMatch(/^postgres:16/);
    const s = stepText(e2e);
    // Browsers come from the Playwright image, pinned to the same version as e2e/package.json.
    const pw = JSON.parse(read('e2e/package.json')).devDependencies['@playwright/test'].replace(
      /^\^|~/,
      '',
    );
    expect(e2e.container).toBe(`mcr.microsoft.com/playwright:v${pw}-noble`);
    expect(e2e.env.DATABASE_URL).toContain('@postgres:5432');
    expect(s).toContain('pnpm e2e');
    expect(read('e2e/playwright.config.ts')).toMatch(/next build|build && .*start/);
  });
});

describe('nightly PBT workflow (Prompt 6)', () => {
  const nightly = wf('.github/workflows/nightly-pbt.yml');

  it('runs on a schedule and on demand', () => {
    expect(nightly.on.schedule[0].cron).toBeTruthy();
    expect(nightly.on.workflow_dispatch).not.toBeUndefined();
  });

  it('runs the property suites with FC_NUM_RUNS=2000', () => {
    const job = Object.values(nightly.jobs)[0] as { env?: Record<string, unknown>; steps: unknown };
    const env = { ...nightly.env, ...job.env };
    expect(String(env.FC_NUM_RUNS)).toBe('2000');
    expect(stepText(job)).toContain('pnpm test:pbt');
  });
});

describe('README (Prompt 6)', () => {
  const readme = read('README.md');
  it('shows the CI badge', () => {
    expect(readme).toContain('actions/workflows/ci.yml/badge.svg');
  });
  it('has a coverage summary section', () => {
    expect(readme).toMatch(/^## Coverage/m);
  });
});

describe('root scripts (Prompt 6)', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  it('has test:coverage and test:pbt', () => {
    expect(scripts['test:coverage']).toContain('--coverage');
    expect(scripts['test:pbt']).toContain('prop');
  });
});
