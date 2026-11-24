// @spec living-soul#1 Speech client.
// @spec living-soul#1.4 Prompt 80 in the UI: the Living Soul tab takes a rule change typed or
// spoken. The e2e API has no speech service (no AWS in tests): a recording made with the fake
// microphone reaches the API and the tab says to type it instead; typed requests are normalised.
import { expect, test } from '@playwright/test';
import { raiseShifa } from './helpers/raise';
test('a typed rule change is read with its numbers: "das feesad" is 10%', async ({ page }) => {
  await raiseShifa(page, { recorded: true });
  await page.getByRole('tab', { name: 'Living Soul', exact: true }).click();
  const tab = page.getByTestId('living-soul');
  await tab.getByLabel('Or type it').fill('senior citizen ko das feesad discount do');
  await tab.getByRole('button', { name: 'Read it' }).click();
  await expect(tab.getByTestId('living-transcript')).toHaveText(
    'senior citizen ko das feesad discount do',
  );
  await expect(tab.getByTestId('living-normalised')).toHaveText(
    'senior citizen ko 10% discount do',
  );
  // Urdu script: right to left, in the Urdu font.
  await tab.getByLabel('Or type it').fill('پانچ ہزار سے اوپر کے بل پر دس فیصد رعایت');
  await tab.getByRole('button', { name: 'Read it' }).click();
  const urdu = tab.getByTestId('living-normalised');
  await expect(urdu).toHaveText('5000 سے اوپر کے بل پر 10% رعایت');
  await expect(urdu).toHaveAttribute('lang', 'ur');
  await expect(urdu).toHaveAttribute('dir', 'rtl');
});
test('speaking records with the microphone; with no speech service it says to type', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone']);
  await raiseShifa(page, { recorded: true });
  await page.getByRole('tab', { name: 'Living Soul', exact: true }).click();
  const tab = page.getByTestId('living-soul');
  await tab.getByRole('button', { name: 'Speak a change' }).click();
  await expect(tab.getByTestId('living-recording')).toBeVisible();
  await page.waitForTimeout(1200);
  const sent = page.waitForRequest((r) => r.url().endsWith('/api/voice') && r.method() === 'POST');
  await tab.getByRole('button', { name: 'Stop and read it' }).click();
  const body = (await sent).postDataJSON() as { audio: { mime: string; base64: string } };
  // The browser's own recording, as it is: webm/opus in Chromium.
  expect(body.audio.mime).toMatch(/^audio\/webm/);
  expect(body.audio.base64.length).toBeGreaterThan(100);
  await expect(tab.getByTestId('living-error')).toHaveText(
    'No speech service is set up on this API: type the change instead',
  );
  await expect(tab.getByTestId('living-recording')).toHaveCount(0);
});
