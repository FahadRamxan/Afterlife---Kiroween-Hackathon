// Prompt 50: guided possession. The owner records a séance on a raised Shifa (the real EXE in
// js-dos in the page); running possession again, the Possessor walks the owner's path first, and
// the Possession tab says so. The e2e worker has no speech service, and its log says the voice
// note part honestly (this séance has no voice note).
import { expect, test } from '@playwright/test';

const API = 'http://localhost:4000';

test("after a séance, possession walks the owner's path first", async ({ page }) => {
  // The worker runs one possession at a time, and other tests raise apps too.
  test.setTimeout(240_000);
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const projectId = page.url().split('/').at(-1)!;
  // The first possession, blind (no séance yet), is done before possess can run again.
  await expect(page.getByTestId('step-possess')).toHaveAttribute('data-status', 'done', {
    timeout: 150_000,
  });

  // The séance: Customers, then back. Two actions.
  const section = page.getByRole('region', { name: 'Record a séance' });
  await section.getByRole('button', { name: 'Record a séance' }).click();
  await expect(section.getByTestId('seance-screen')).toHaveText('MAIN MENU', { timeout: 60_000 });
  await section
    .getByRole('application', { name: 'Shifa Medical Store keyboard: type here' })
    .click();
  for (const key of ['3', 'Escape']) {
    await page.keyboard.press(key);
    await expect(section.getByText(/keys? waiting/)).toHaveCount(0, { timeout: 20_000 });
  }
  await section
    .getByRole('button', { name: 'Save the séance (2 actions)' })
    .click({ timeout: 30_000 });
  const id = (await section.getByTestId('seance-saved').innerText()).match(/[0-9a-f-]{36}/)![0];
  // Each action knows when it was pressed, for the voice notes (Prompt 50).
  const saved = await (await page.request.get(`${API}/api/sessions/${id}`)).json();
  expect(saved.actions.map((a: { atMs?: number }) => typeof a.atMs)).toEqual(['number', 'number']);

  await page.getByRole('button', { name: 'Run possess again, alone' }).click();
  const stats = page.getByTestId('possession-stats');
  await expect(stats.getByTestId('stat-guided')).toHaveText("2 steps on the owner's séance path", {
    timeout: 150_000,
  });
  const steps = stats.getByTestId('possession-steps');
  await expect(steps.locator('li[data-kind="guide"]').first()).toContainText(
    "1. owner pressed 3 → CUSTOMERS · owner's path",
  );
  await expect(steps.locator('li[data-kind="guide"]').nth(1)).toContainText('owner pressed {Esc}');
  await page.request.delete(`${API}/api/projects/${projectId}`);
});
