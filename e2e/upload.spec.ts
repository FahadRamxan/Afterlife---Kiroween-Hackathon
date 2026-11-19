// Prompt 40: upload your own dead app. The zip goes to the server, which checks it, virus-scans it
// (here with the EICAR-only test scanner: no ClamAV on this machine; the result says so), builds
// its js-dos bundle and opens the project, where the uploaded program boots in the emulator.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

const DIST = resolve(__dirname, '../samples/graveyard/dist/shifa');
const file = (name: string) => new Uint8Array(readFileSync(resolve(DIST, name)));
const SHIFA = Object.fromEntries(
  ['SHIFA.EXE', 'MEDICINE.DBF', 'BILLS.DBF', 'BILLITEM.DBF', 'CUSTOMER.DBF'].map((n) => [
    n,
    file(n),
  ]),
);
// The EICAR test file, built from two halves (no file in the repo is the test file itself).
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(
  '',
);
const API = 'http://localhost:4000';

async function choose(page: Page, name: string, entries: Record<string, Uint8Array>) {
  await page.goto('/graveyard');
  const card = page.getByTestId('upload-card');
  await card
    .getByLabel('Choose a zip with the EXE and DBF files')
    .setInputFiles({ name, mimeType: 'application/zip', buffer: Buffer.from(zipSync(entries)) });
  await expect(card.getByRole('status').filter({ hasText: 'Found' })).toBeVisible();
  return card;
}

test.describe('upload your own dead app', () => {
  test('a sample zip is scanned, bundled, and its program boots in the emulator', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const card = await choose(page, 'my-shop.zip', SHIFA);
    // The DOS clock: suggested from the DBF headers (the newest is 1998), and the owner's choice.
    const day = card.getByLabel('DOS date');
    await expect(day).toHaveValue(/^1998-/);
    await day.fill('1998-07-15');
    await card.getByLabel('DOS time').fill('10:00');
    await card.getByRole('button', { name: 'Raise this app' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const id = page.url().split('/').at(-1)!;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Raising SHIFA (uploaded)');
    await expect(page.getByTestId('dos-clock')).toContainText('1998-07-15 10:00:00');

    const log = page.getByTestId('live-log');
    await expect(log).toContainText('Scanning my-shop.zip with test scanner (EICAR only', {
      timeout: 30_000,
    });
    await expect(log).toContainText('No virus found');
    // The uploaded EXE, booted from the bundle the server built, inside headless js-dos.
    await expect(page.getByTestId('live-screen')).toContainText('SHIFA MEDICAL STORE', {
      timeout: 90_000,
    });
    await expect(page.getByTestId('live-screen')).toContainText('MAIN MENU');
    // Booted at the chosen clock: the title bar shows its date.
    await expect(page.getByTestId('live-screen')).toContainText('15/07/98');
    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('a Windows program is refused by the server before anything is stored', async ({ page }) => {
    const pe = new Uint8Array(256);
    pe.set([0x4d, 0x5a]);
    new DataView(pe.buffer).setUint32(0x3c, 0x80, true);
    pe.set([0x50, 0x45, 0, 0], 0x80);
    const card = await choose(page, 'setup.zip', {
      'SETUP.EXE': pe,
      'MEDICINE.DBF': SHIFA['MEDICINE.DBF']!,
    });
    await card.getByRole('button', { name: 'Raise this app' }).click();
    await expect(card.getByRole('alert')).toContainText(
      'The server refused this zip: SETUP.EXE is a Windows program (PE), not a DOS program',
    );
    await expect(page).toHaveURL(/\/graveyard$/);
  });

  test('a zip with a virus is caught by the scan, deleted, and never run', async ({ page }) => {
    test.setTimeout(90_000);
    const card = await choose(page, 'infected.zip', { ...SHIFA, 'README.TXT': strToU8(EICAR) });
    await card.getByRole('button', { name: 'Raise this app' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const id = page.url().split('/').at(-1)!;
    await expect(page.getByTestId('live-log')).toContainText(
      'Virus found: EICAR-Test-File. The upload was deleted and will not be run.',
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('live-screen')).toHaveCount(0);
    const project = await (await page.request.get(`${API}/api/projects/${id}`)).json();
    expect(project.status).toBe('failed');
    await page.request.delete(`${API}/api/projects/${id}`);
  });
});
