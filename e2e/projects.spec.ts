// Prompt 36: Raise creates a project through the API (on a real Postgres), and the Raise page
// shows its id and timeline.
import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000';

test.describe('projects', () => {
  test('clicking Raise creates a project and the Raise page shows its id', async ({ page }) => {
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const id = page.url().split('/').at(-1)!;

    await expect(page.getByTestId('project-id')).toHaveText(id);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Raising Shifa Medical Store' }),
    ).toBeVisible();
    const timeline = page.getByTestId('timeline');
    await expect(timeline.locator('li[data-kind="project_created"]')).toContainText(
      'Project created',
    );
    // The possession tab still has the live séance recorder on the real Shifa.
    await expect(page.getByRole('tab', { name: 'Possession' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // It really is in the API (and so in Postgres).
    const res = await page.request.get(`${API}/api/projects/${id}`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ id, sourceApp: 'shifa', status: 'created' });

    // Reloading the page reads it back.
    await page.reload();
    await expect(page.getByTestId('project-id')).toHaveText(id);

    // Clean up: deleting it makes the page say so.
    expect((await page.request.delete(`${API}/api/projects/${id}`)).status()).toBe(204);
    await page.reload();
    await expect(page.getByTestId('project-error')).toContainText('There is no such project');
  });

  test('when the API is down, Raise says it was not saved and still opens the app', async ({
    page,
  }) => {
    await page.route('**/api/projects', (route) => route.abort('connectionrefused'));
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Iqra School Fees' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'was not saved' });
    await expect(alert).toBeVisible();
    await alert.getByRole('link', { name: 'Open it without saving' }).click();
    await expect(page).toHaveURL(/\/raise\/iqra$/, { timeout: 15_000 });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Raising Iqra School Fees' }),
    ).toBeVisible();
  });

  test('a rate-limited Raise shows the reason', async ({ page }) => {
    await page.route('**/api/projects', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'RATE_LIMITED', message: 'Try again in 1 minute.' }),
      }),
    );
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Barkat Kiryana Ledger' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Too many raises' })).toContainText(
      'Try again in 1 minute.',
    );
  });

  test('the API documents the projects routes (OpenAPI)', async ({ request }) => {
    const doc = await (await request.get(`${API}/api/openapi.json`)).json();
    expect(Object.keys(doc.paths)).toContain('/api/projects/{id}/timeline');
    const ui = await request.get(`${API}/api/docs/`);
    expect(ui.status()).toBe(200);
  });
});
