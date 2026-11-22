// @spec code-export#2.2 Prompt 62: the Export link on the Soul tab downloads the reborn app as
// code: a Next.js app with its Soul, the old app's records, the Kiro files and its tests. That it
// installs, passes its tests and builds on its own is `pnpm export:check` (a ci:local step).
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';
import { API, raiseShifaWithSoul } from './helpers/raise';

test('Export downloads the reborn app: the app, its Soul and records, Kiro files and tests', async ({
  page,
}) => {
  const id = await raiseShifaWithSoul(page, SHIFA_REFERENCE_SOUL, { recorded: true });
  await page.goto(`/raise/${id}?tab=soul`);
  const link = page.getByRole('link', { name: 'Export the reborn app' });
  await expect(link).toBeVisible({ timeout: 30_000 });
  // The Soul tab can draw itself again as the project's last events arrive, taking the link with
  // it mid-click; a click that started no download is tried again.
  let download!: import('@playwright/test').Download;
  await expect(async () => {
    [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      link.click(),
    ]);
  }).toPass({ timeout: 90_000 });
  expect(download.suggestedFilename()).toBe('shifa-reborn.zip');
  const chunks: Buffer[] = [];
  for await (const c of (await download.createReadStream())!) chunks.push(c as Buffer);
  const zip = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  const files = Object.keys(zip);
  for (const f of [
    'shifa-reborn/package.json',
    'shifa-reborn/app/reborn-app.tsx',
    'shifa-reborn/soul.json',
    'shifa-reborn/data/MEDICINE.json',
    'shifa-reborn/lib/afterlife/vessel/runtime.ts',
    'shifa-reborn/.kiro/specs/shifa-rebirth/requirements.md',
    'shifa-reborn/.kiro/steering/legacy-behaviour.md',
    'shifa-reborn/tests/runtime.prop.test.ts',
  ])
    expect(files).toContain(f);
  const soul = JSON.parse(strFromU8(zip['shifa-reborn/soul.json']!)) as { app: { name: string } };
  expect(soul.app.name).toBe('Shifa Medical Store');
  const pkg = JSON.parse(strFromU8(zip['shifa-reborn/package.json']!)) as {
    scripts: { test: string };
  };
  expect(pkg.scripts.test).toBe('tsc --noEmit && vitest run');
  await page.request.delete(`${API}/api/projects/${id}`);
});
