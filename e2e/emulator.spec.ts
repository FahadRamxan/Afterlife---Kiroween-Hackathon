// Prompt 27: the real Shifa EXE running in js-dos v8 in the page, driven through BrowserJsDos and
// read back with decodeScreen.
import { expect, test } from '@playwright/test';

test.describe('live js-dos on /design', () => {
  test.setTimeout(120_000);

  test('boots Shifa, presses 2 and sees the Stock screen through decodeScreen', async ({
    page,
  }) => {
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/js-dos/') && r.status() >= 400)
        failed.push(`${r.status()} ${r.url()}`);
    });
    await page.goto('/design');
    const section = page.getByTestId('ds-live');
    await section.getByRole('button', { name: 'Boot Shifa Medical Store in js-dos' }).click();

    const screen = section.getByRole('region', { name: 'Shifa Medical Store, running live' });
    await expect(screen).toContainText('MAIN MENU', { timeout: 60_000 });
    // The DOS clock was set at boot, so the date is the app's 1998.
    await expect(screen).toContainText('15/07/98');
    await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: MAIN MENU');

    await section.getByLabel('Keys to send').fill('2');
    await section.getByRole('button', { name: 'Send' }).click();
    await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: STOCK', {
      timeout: 15_000,
    });
    await expect(screen).toContainText('PAN500 PANADOL 500MG STRIP');
    await expect(screen).toContainText('Page 1 of 3');

    // The files on drive C:, read out of the emulator.
    await section.getByRole('button', { name: 'Read files' }).click();
    const files = section.getByRole('table', { name: 'Files on drive C:' });
    await expect(files.getByRole('row', { name: /MEDICINE\.DBF\s+2,466/ })).toBeVisible();
    await expect(files.getByRole('row', { name: /SHIFA\.EXE/ })).toBeVisible();

    // Reset boots the program again: back on the main menu.
    await section.getByRole('button', { name: 'Reset' }).click();
    await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: MAIN MENU', {
      timeout: 60_000,
    });
    expect(failed).toEqual([]);
  });

  test('a bad key sequence is refused with the reason', async ({ page }) => {
    await page.goto('/design');
    const section = page.getByTestId('ds-live');
    await section.getByRole('button', { name: 'Boot Shifa Medical Store in js-dos' }).click();
    await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: MAIN MENU', {
      timeout: 60_000,
    });
    await section.getByLabel('Keys to send').fill('{PgDown}');
    await section.getByRole('button', { name: 'Send' }).click();
    await expect(section.getByRole('alert')).toHaveText(
      'Not a key sequence: unknown key "PgDown" at 0',
    );
  });
});
