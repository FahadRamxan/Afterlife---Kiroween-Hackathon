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

  test('Record shows what an action did: nothing for Esc, the new bill for F2', async ({
    page,
  }) => {
    await page.goto('/design');
    const section = page.getByTestId('ds-live');
    await section.getByRole('button', { name: 'Boot Shifa Medical Store in js-dos' }).click();
    await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: MAIN MENU', {
      timeout: 60_000,
    });
    const keys = section.getByLabel('Keys to send');
    const record = section.getByRole('button', { name: 'Record' });
    const last = section.getByRole('region', { name: 'Last observation' });

    await keys.fill('{Esc}');
    await record.click();
    await expect(last).toContainText('{Esc}: MAIN MENU → MAIN MENU');
    await expect(last).toContainText('No data changed.');

    await keys.fill('1{Enter}PAN500{Enter}4{Enter}{Enter}');
    await record.click();
    await expect(last).toContainText('MAIN MENU → NEW BILL', { timeout: 20_000 });
    await expect(last).toContainText('No data changed.');

    await keys.fill('{F2}');
    await record.click();
    await expect(last).toContainText('{F2}: NEW BILL → NEW BILL', { timeout: 20_000 });
    await expect(last).toContainText('BILLS.DBF');
    await expect(last).toContainText('+ 9807-0001');
    await expect(last).toContainText('PAN500 QTY 240 → 236 (-4)');
    await expect(
      section.getByRole('region', { name: 'Shifa Medical Store, running live' }),
    ).toContainText('BILL 9807-0001 SAVED');
  });

  test('replaying a bill 3 times from a fresh state gives identical data files', async ({
    page,
  }) => {
    await page.goto('/design');
    const section = page.getByTestId('ds-live');
    await section.getByRole('button', { name: 'Boot Shifa Medical Store in js-dos' }).click();
    await expect(section.getByTestId('live-screen-name')).toHaveText('Screen: MAIN MENU', {
      timeout: 60_000,
    });
    await section
      .getByLabel('Keys to send')
      .fill('1{Enter}PAN500{Enter}4{Enter}{Enter}{F2}{Enter}');
    await section.getByRole('button', { name: 'Replay 3 times from a fresh state' }).click();
    const replays = section.getByRole('region', { name: 'Replays' });
    await expect(replays.getByRole('status')).toHaveText('3 of 3 runs gave identical data files.', {
      timeout: 90_000,
    });
    const runs = await replays.getByRole('listitem').allInnerTexts();
    expect(runs).toHaveLength(3);
    expect(new Set(runs.map((r) => r.split(': ')[1])).size).toBe(1);
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
