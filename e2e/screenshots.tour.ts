// Screenshot tour of every screen, for docs/screenshots and the README.
// Not part of `pnpm e2e` (the file name does not end in .spec.ts). Run: pnpm screenshots
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { zipSync } from 'fflate';

const OUT = '../docs/screenshots';

async function ready(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
}

test.use({ reducedMotion: 'reduce' });

test('landing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page, '/');
  await page.screenshot({ path: `${OUT}/01-landing.png` });
});

test('graveyard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1100 });
  await ready(page, '/graveyard');
  await page.screenshot({ path: `${OUT}/02-graveyard.png` });
});

test('graveyard on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await ready(page, '/graveyard');
  await page.screenshot({ path: `${OUT}/03-graveyard-mobile.png`, fullPage: true });
});

test('graveyard in Urdu', async ({ page, context }) => {
  await context.addCookies([
    { name: 'afterlife-locale', value: 'ur', url: 'http://localhost:3000' },
  ]);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await ready(page, '/graveyard');
  await page.screenshot({ path: `${OUT}/04-graveyard-urdu.png` });
});

test('raise tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await ready(page, '/raise/shifa?tab=soul');
  await page.screenshot({ path: `${OUT}/05-raise-tabs.png` });
});

test('design system', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await ready(page, '/design');
  await page.screenshot({ path: `${OUT}/06-design-system.png`, fullPage: true });
});

test('dbf table', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await ready(page, '/design');
  await page.getByTestId('ds-dbftable').screenshot({ path: `${OUT}/07-dbf-table.png` });
});

test('dbf diff with tooltip', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await ready(page, '/design');
  const diff = page.getByTestId('ds-dbfdiff');
  await diff.getByRole('row').filter({ hasText: 'PAN500' }).getByRole('gridcell').last().hover();
  await diff.screenshot({ path: `${OUT}/08-dbf-diff-tooltip.png` });
});

test('dbf diff scrolled to the end', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await ready(page, '/design');
  const diff = page.getByTestId('ds-dbfdiff');
  await diff.getByRole('grid').locator('[data-cell="0-0"]').click();
  await page.keyboard.press('Control+End');
  await page.mouse.move(0, 0);
  await diff.screenshot({ path: `${OUT}/09-dbf-diff-end.png` });
});

test('upload preview (DBF inspector)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 });
  await ready(page, '/graveyard');
  const dist = (n: string) =>
    new Uint8Array(readFileSync(resolve(__dirname, '../samples/graveyard/dist/shifa', n)));
  const card = page.getByTestId('upload-card');
  await card.getByLabel('Choose a zip with the EXE and DBF files').setInputFiles({
    name: 'shifa.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({ 'SHIFA.EXE': dist('SHIFA.EXE'), 'MEDICINE.DBF': dist('MEDICINE.DBF') }),
    ),
  });
  await expect(card.getByTestId('upload-preview')).toBeVisible();
  await card.screenshot({ path: `${OUT}/10-upload-preview.png` });
});
