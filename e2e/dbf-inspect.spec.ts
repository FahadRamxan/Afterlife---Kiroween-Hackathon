// Prompt 21: the "Upload your own dead app" card checks the zip in the browser, then previews its
// tables through POST /api/dbf/inspect (the real API, started by playwright.config.ts).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { writeDbf } from '@afterlife/dbf';
import { zipSync } from 'fflate';

const DIST = resolve(__dirname, '../samples/graveyard/dist/shifa');
const file = (name: string) => new Uint8Array(readFileSync(resolve(DIST, name)));

async function upload(page: Page, name: string, entries: Record<string, Uint8Array> | Buffer) {
  const buffer = Buffer.isBuffer(entries) ? entries : Buffer.from(zipSync(entries));
  const card = page.getByTestId('upload-card');
  await card
    .getByLabel('Choose a zip with the EXE and DBF files')
    .setInputFiles({ name, mimeType: 'application/zip', buffer });
  return card;
}

test.describe('upload card: DBF inspector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/graveyard');
  });

  test('a real Shifa zip shows its files and previews MEDICINE.DBF rows', async ({ page }) => {
    const card = await upload(page, 'shifa.zip', {
      'SHIFA.EXE': file('SHIFA.EXE'),
      'MEDICINE.DBF': file('MEDICINE.DBF'),
      'BILLS.DBF': file('BILLS.DBF'),
    });
    // While the API answers, "Reading the tables..." is a second status line.
    await expect(card.getByRole('status').filter({ hasText: 'Found' })).toHaveText(
      'Found SHIFA.EXE and 2 DBF files.',
    );
    const medicine = card.getByRole('grid', { name: 'MEDICINE.DBF (40 records)' });
    await expect(medicine).toBeVisible();
    await expect(medicine.getByRole('row').nth(1)).toContainText('PAN500');
    await expect(medicine.getByRole('row').nth(1)).toContainText('PANADOL 500MG STRIP');
    await expect(medicine.getByRole('columnheader')).toHaveText([
      '#',
      'CODEC(6)',
      'NAMEC(20)',
      'BATCHC(8)',
      'EXPIRYD',
      'PRICEN(8,2)',
      'QTYN(5)',
    ]);
    await expect(card.getByRole('grid', { name: /^BILLS\.DBF \(\d+ records\)$/ })).toBeVisible();
    await expect(card).toContainText('Nothing is stored');
    // The visible caption names the file, and the card takes the whole row so the table has room.
    await expect(card.getByRole('heading', { name: 'MEDICINE.DBF (40 records)' })).toBeVisible();
    const tombstone = (await page.getByTestId('tombstone').first().boundingBox())!;
    expect((await card.boundingBox())!.width).toBeGreaterThan(tombstone.width * 2);
  });

  test('the preview is keyboard navigable', async ({ page }) => {
    const card = await upload(page, 'shifa.zip', {
      'SHIFA.EXE': file('SHIFA.EXE'),
      'MEDICINE.DBF': file('MEDICINE.DBF'),
    });
    const grid = card.getByRole('grid', { name: 'MEDICINE.DBF (40 records)' });
    await grid.locator('[data-cell="0-1"]').click();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toHaveText('BRU400');
  });

  test('refuses a file named .zip that is not a zip', async ({ page }) => {
    const card = await upload(page, 'myapp.zip', Buffer.from('PK\x03\x04 not really a zip'));
    await expect(card.getByRole('alert')).toHaveText('That file is not a real zip.');
  });

  test('refuses a zip without a DOS program, and lists what it found', async ({ page }) => {
    const card = await upload(page, 'data.zip', { 'MEDICINE.DBF': file('MEDICINE.DBF') });
    await expect(card.getByRole('alert')).toHaveText('The zip has no DOS program (EXE or COM).');
    await card.getByText('Files in the zip').click();
    await expect(card.getByRole('listitem')).toHaveText(['MEDICINE.DBF']);
  });

  test('refuses a zip without DBF files', async ({ page }) => {
    const card = await upload(page, 'exe.zip', { 'SHIFA.EXE': file('SHIFA.EXE') });
    await expect(card.getByRole('alert')).toHaveText('The zip has no DBF data files.');
  });

  test('one broken or empty DBF shows its reason in its place, and the others still show', async ({
    page,
  }) => {
    const card = await upload(page, 'shop.zip', {
      'SHIFA.EXE': file('SHIFA.EXE'),
      'DATA/BROKEN.DBF': file('SHIFA.EXE'),
      'DATA/TEMP0001.DBF': new Uint8Array(0),
      'DATA/MEDICINE.DBF': file('MEDICINE.DBF'),
    });
    await expect(card.getByRole('grid', { name: 'DATA/MEDICINE.DBF (40 records)' })).toBeVisible();
    const unread = card.getByTestId('unread-file');
    await expect(unread).toHaveCount(2);
    await expect(unread.nth(0)).toContainText('DATA/BROKEN.DBF');
    await expect(unread.nth(0)).toContainText(
      'This file could not be read: Not a supported .DBF version byte',
    );
    await expect(unread.nth(1)).toContainText('DATA/TEMP0001.DBF');
    await expect(unread.nth(1)).toContainText('A .DBF needs at least 33 bytes, got 0');
  });

  test('years of bill lines preview fine: only the first 100 records are sent', async ({
    page,
  }) => {
    // 600,000 bill lines of 41 bytes: about 25 MB, over the 20 MB the API takes.
    const lines = writeDbf({
      fields: [
        { name: 'BILL_NO', type: 'C', length: 9, decimals: 0 },
        { name: 'LINE', type: 'N', length: 2, decimals: 0 },
        { name: 'CODE', type: 'C', length: 6, decimals: 0 },
        { name: 'QTY', type: 'N', length: 5, decimals: 0 },
        { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
        { name: 'AMOUNT', type: 'N', length: 10, decimals: 2 },
      ],
      records: Array.from({ length: 600_000 }, (_, i) => ({
        deleted: false,
        values: {
          BILL_NO: '9807-0001',
          LINE: String(i % 99),
          CODE: 'PAN500',
          QTY: '1',
          PRICE: '12.50',
          AMOUNT: '12.50',
        },
      })),
    });
    expect(lines.length).toBeGreaterThan(20 * 1024 * 1024);
    const sent: number[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/api/dbf/inspect')) sent.push(r.postDataBuffer()?.length ?? 0);
    });
    const card = await upload(page, 'shifa-years.zip', {
      'SHIFA.EXE': file('SHIFA.EXE'),
      'BILLITEM.DBF': lines,
    });
    await expect(card.getByRole('grid', { name: 'BILLITEM.DBF (600,000 records)' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(card).toContainText('Showing the first 100 of 600000 records.');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeLessThan(64 * 1024);
  });

  test('a folder with more than 50 DBFs previews the first 50 and says how many were left out', async ({
    page,
  }) => {
    const entries: Record<string, Uint8Array> = { 'SHIFA.EXE': file('SHIFA.EXE') };
    for (let i = 0; i < 53; i++)
      entries[`T${String(i).padStart(2, '0')}.DBF`] = file('CUSTOMER.DBF');
    const card = await upload(page, 'many.zip', entries);
    await expect(card.getByRole('grid')).toHaveCount(50, { timeout: 30_000 });
    await expect(card).toContainText(
      '3 more DBF files were not previewed: the first 50 are shown.',
    );
  });

  test('says so when the API cannot be reached', async ({ page }) => {
    await page.route('**/api/dbf/inspect', (route) => route.abort());
    const card = await upload(page, 'shifa.zip', {
      'SHIFA.EXE': file('SHIFA.EXE'),
      'MEDICINE.DBF': file('MEDICINE.DBF'),
    });
    await expect(card.getByRole('alert')).toHaveText(
      'The tables could not be read: the API is not reachable.',
    );
  });

  test('a file that is not named .zip is refused before it is read', async ({ page }) => {
    const card = page.getByTestId('upload-card');
    await card.getByLabel('Choose a zip with the EXE and DBF files').setInputFiles({
      name: 'myapp.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    });
    await expect(card.getByRole('alert')).toHaveText('Choose a .zip file.');
  });
});
