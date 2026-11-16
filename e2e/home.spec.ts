import { expect, test } from '@playwright/test';

test('landing shows the Afterlife heading and tagline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Afterlife' })).toBeVisible();
  await expect(page.getByText('Software that outlives its source code.')).toBeVisible();
});
