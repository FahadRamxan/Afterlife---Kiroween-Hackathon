import { expect, test } from '@playwright/test';

test.describe('API status chip', () => {
  test('is green when the API answers /health @smoke', async ({ page }) => {
    await page.goto('/');
    const chip = page.getByTestId('api-status');
    await expect(chip).toHaveAttribute('data-state', 'healthy', { timeout: 15_000 });
    await expect(chip).toContainText('API healthy');
  });

  test('is red when the API is unreachable', async ({ page }) => {
    await page.route('**/health', (route) => route.abort('connectionrefused'));
    await page.goto('/');
    const chip = page.getByTestId('api-status');
    await expect(chip).toHaveAttribute('data-state', 'down');
    await expect(chip).toContainText('API down');
  });

  test('is red when the API returns an error', async ({ page }) => {
    await page.route('**/health', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto('/graveyard');
    await expect(page.getByTestId('api-status')).toHaveAttribute('data-state', 'down');
  });

  test('the landing page loads @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
