// @spec surgeon#3 The reborn moment.
// @spec surgeon#3.2 Prompt 63 done when: after the rebirth step, the Raise page shows the reborn
// moment (the tombstone cracks, the app's card rises) and the link to the reborn app.
import { expect, test } from '@playwright/test';
import { API, raiseShifa } from './helpers/raise';

test.describe('the reborn moment', () => {
  test('after the rebirth step the tombstone cracks and the card rises with the Vessel link', async ({
    page,
  }) => {
    const id = await raiseShifa(page, { recorded: true });
    await expect(page.getByTestId('step-rebirth')).toHaveAttribute('data-status', 'done');
    const reborn = page.getByTestId('reborn');
    await expect(reborn.getByRole('heading', { name: 'Reborn' })).toBeVisible({ timeout: 30_000 });
    // The card rises once the stone has cracked.
    await expect(reborn).toHaveAttribute('data-cracked', 'true', { timeout: 10_000 });
    const card = page.getByTestId('reborn-card');
    await expect(card).toContainText('2 actions passed the Surgeon’s checks and went live:');
    await expect(card.getByRole('listitem')).toHaveText(['Save a bill', 'Add a customer']);
    await card.getByRole('link', { name: 'Use the reborn app' }).click();
    await expect(page).toHaveURL(new RegExp(`/vessel/${id}$`));
    await expect(page.getByTestId('vessel-app')).toBeVisible({ timeout: 30_000 });
    await page.request.delete(`${API}/api/projects/${id}`);
  });

  test('under reduced motion the card is there at once, and no stone cracks', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = await raiseShifa(page, { recorded: true });
    const reborn = page.getByTestId('reborn');
    await expect(reborn).toHaveAttribute('data-cracked', 'true', { timeout: 30_000 });
    await expect(page.getByTestId('reborn-tombstone')).toHaveCount(0);
    await expect(page.getByTestId('reborn-card')).toBeVisible();
    await page.request.delete(`${API}/api/projects/${id}`);
  });
});
