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

test('live js-dos: Shifa stock screen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1100, height: 900 });
  await ready(page, '/design');
  const section = page.getByTestId('ds-live');
  await section.getByRole('button', { name: 'Boot Shifa Medical Store in js-dos' }).click();
  await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: MAIN MENU', {
    timeout: 60_000,
  });
  await section.getByLabel('Keys to send').fill('2');
  await section.getByRole('button', { name: 'Send' }).click();
  await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: STOCK');
  await section.getByRole('button', { name: 'Read files' }).click();
  await section.screenshot({ path: `${OUT}/11-live-jsdos.png` });
});

test('recorded observation: saving a Shifa bill', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1100, height: 900 });
  await ready(page, '/design');
  const section = page.getByTestId('ds-live');
  await section.getByRole('button', { name: 'Boot Shifa Medical Store in js-dos' }).click();
  await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: MAIN MENU', {
    timeout: 60_000,
  });
  const keys = section.getByLabel('Keys to send');
  const record = section.getByRole('button', { name: 'Record' });
  const last = section.getByRole('region', { name: 'Last observation' });
  await keys.fill('1{Enter}PAN500{Enter}4{Enter}BRU400{Enter}2{Enter}{Enter}');
  await record.click();
  await expect(last).toContainText('NEW BILL', { timeout: 20_000 });
  await keys.fill('{F2}');
  await record.click();
  await expect(last).toContainText('+ 9807-0001', { timeout: 20_000 });
  await section.screenshot({ path: `${OUT}/12-observation.png` });
});

test('séance recording on the Raise page', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 1300 });
  await ready(page, '/raise/shifa');
  const section = page.getByRole('region', { name: 'Record a séance' });
  await section.getByRole('button', { name: 'Record a séance' }).click();
  await expect(section.getByTestId('seance-screen')).toHaveText('MAIN MENU', { timeout: 60_000 });
  await section.getByRole('application').click();
  for (const key of ['2', 'PageDown', 'Escape', '3', 'Escape']) {
    await page.keyboard.press(key);
    await expect(section.getByText(/keys? waiting/)).toHaveCount(0, { timeout: 20_000 });
  }
  await expect(
    section.getByRole('list', { name: 'Séance timeline' }).getByRole('listitem'),
  ).toHaveCount(5);
  await page.mouse.click(5, 5);
  await section.screenshot({ path: `${OUT}/13-seance.png` });
});

test('a raised project: live screen from the worker, and the six steps', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 1600 });
  await ready(page, '/graveyard');
  await page.getByRole('button', { name: 'Raise Iqra School Fees' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByTestId('live-screen')).toContainText('MAIN MENU', { timeout: 90_000 });
  await expect(page.getByTestId('steps').getByRole('progressbar')).toHaveAccessibleName(
    /^6 of 6 steps run/,
    { timeout: 60_000 },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${OUT}/14-raised-project.png`, fullPage: true });
});

test('upload your own dead app: the DOS clock and Raise this app', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1500 });
  await ready(page, '/graveyard');
  const dist = (n: string) =>
    new Uint8Array(readFileSync(resolve(__dirname, '../samples/graveyard/dist/shifa', n)));
  const card = page.getByTestId('upload-card');
  await card.getByLabel('Choose a zip with the EXE and DBF files').setInputFiles({
    name: 'my-shop.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(
      zipSync({ 'SHIFA.EXE': dist('SHIFA.EXE'), 'MEDICINE.DBF': dist('MEDICINE.DBF') }),
    ),
  });
  await expect(card.getByRole('button', { name: 'Raise this app' })).toBeVisible();
  await card.screenshot({ path: `${OUT}/15-upload-raise.png` });
});
