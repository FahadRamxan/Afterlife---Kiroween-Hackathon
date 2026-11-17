import { expect, test } from '@playwright/test';

const routes: [string, string | RegExp][] = [
  ['/', 'Afterlife'],
  ['/graveyard', 'The Graveyard'],
  ['/raise/demo-project', 'Raising demo-project'],
  ['/vessel/demo-project', 'Reborn app'],
  ['/verify/cert-123', 'Verify a certificate'],
  ['/playground', 'Judge Playground'],
  ['/design', 'Haunted Ledger'],
];

test.describe('app shell', () => {
  for (const [route, heading] of routes) {
    test(`${route} renders its heading and the top bar`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Afterlife home' })).toBeVisible();
      await expect(page.getByRole('group', { name: 'Language' })).toBeVisible();
    });
  }

  // /graveyard has real content since Prompt 16 (e2e/graveyard.spec.ts).
  for (const route of ['/vessel/demo-project', '/verify/cert-123', '/playground']) {
    test(`${route} shows an empty state`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId('empty-state')).toBeVisible();
    });
  }

  test('top bar navigation works', async ({ page }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Graveyard' })
      .click();
    await expect(page).toHaveURL(/\/graveyard$/);
    await page.getByRole('link', { name: 'Afterlife home' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('raise tabs', () => {
  const tabs = ['Possession', 'Soul', 'Proof', 'Exorcism', 'Ghost Twin', 'Living Soul'];

  test('shows the six tabs in order, Possession first', async ({ page }) => {
    await page.goto('/raise/demo-project');
    const list = page.getByRole('tablist', { name: 'Rebirth steps' });
    await expect(list.getByRole('tab')).toHaveText(tabs);
    await expect(list.getByRole('tab', { name: 'Possession' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel')).toContainText('Press Raise to begin');
  });

  test('selecting a tab updates the URL, and the URL restores the tab', async ({ page }) => {
    await page.goto('/raise/demo-project');
    await page.getByRole('tab', { name: 'Proof' }).click();
    await expect(page).toHaveURL(/\?tab=proof$/);
    await expect(page.getByRole('tabpanel')).toContainText('No proof run yet');
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Proof' })).toHaveAttribute('aria-selected', 'true');
  });

  test('tabs work with the keyboard', async ({ page }) => {
    await page.goto('/raise/demo-project');
    await page.getByRole('tab', { name: 'Possession' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Soul', exact: true })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Soul', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

test.describe('language toggle', () => {
  test('switches to Urdu (RTL) and the choice persists', async ({ page }) => {
    await page.goto('/graveyard');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByRole('button', { name: 'اردو' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
    await expect(page.getByRole('heading', { level: 1, name: 'قبرستان' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'اردو' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'قبرستان' })).toBeVisible();

    await page.goto('/raise/demo-project');
    await expect(page.getByRole('tab', { name: 'روح', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Raising demo-project' }),
    ).toBeVisible();
  });
});
