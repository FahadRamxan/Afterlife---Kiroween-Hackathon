// Setup project (runs before every other e2e test when BASE_URL is not set). It opens each route
// of apps/web once, so `next dev` compiles every route one at a time, instead of all of them at
// once under load from 10 workers, where first loads timed out in the pre-push hook. Against the
// production build (ci:local) it is a quick check that every route answers.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { expect, test as setup } from '@playwright/test';

const APP_DIR = resolve(__dirname, '../apps/web/app');

// A real value for each dynamic segment, so the page renders instead of 404ing.
const SAMPLE: Record<string, string> = { projectId: 'shifa', certId: 'demo' };

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pages(path);
    return name === 'page.tsx' ? [path] : [];
  });
}

/** Every route under apps/web/app, read from the file system so a new page is never missed. */
export function appRoutes(): string[] {
  return pages(APP_DIR)
    .map((file) => {
      const segments = relative(APP_DIR, file).split(sep).slice(0, -1);
      const filled = segments.map((s) => {
        const m = /^\[(\w+)\]$/.exec(s);
        if (!m) return s;
        const value = SAMPLE[m[1]!];
        if (!value) throw new Error(`warmup.setup.ts: add a sample value for [${m[1]}]`);
        return value;
      });
      return `/${filled.join('/')}`;
    })
    .sort();
}

setup('warm up every route', async ({ page }) => {
  setup.setTimeout(180_000);
  const routes = appRoutes();
  expect(routes).toContain('/raise/shifa');
  // The not-found page is compiled on its own too.
  for (const route of [...routes, '/raise/not-a-graveyard-app']) {
    const res = await page.goto(route, { timeout: 120_000 });
    expect(res?.status(), route).toBeLessThan(500);
  }
});
