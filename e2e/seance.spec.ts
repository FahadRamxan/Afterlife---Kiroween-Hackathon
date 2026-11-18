// Prompt 31: "Record a séance" on the Raise page. The owner works the real Shifa EXE (js-dos in
// the page); every key is recorded as an observation and shown on a timeline.
import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:4000';

async function start(page: Page) {
  await page.goto('/raise/shifa');
  const section = page.getByRole('region', { name: 'Record a séance' });
  await section.getByRole('button', { name: 'Record a séance' }).click();
  await expect(section.getByTestId('seance-screen')).toHaveText('MAIN MENU', { timeout: 60_000 });
  const keyboard = section.getByRole('application', {
    name: 'Shifa Medical Store keyboard: type here',
  });
  await keyboard.click();
  return { section, keyboard };
}

test.describe('séance recording', () => {
  test.setTimeout(120_000);

  test('records 5 actions, shows them on the timeline, and saves them as a session', async ({
    page,
  }) => {
    const { section } = await start(page);
    const timeline = section.getByRole('list', { name: 'Séance timeline' });
    // Stock, next page, back to the menu, customers, back again.
    for (const key of ['2', 'PageDown', 'Escape', '3', 'Escape']) {
      await page.keyboard.press(key);
      await expect(section.getByText(/keys? waiting/)).toHaveCount(0, { timeout: 20_000 });
    }
    const items = timeline.getByRole('listitem');
    await expect(items).toHaveCount(5, { timeout: 30_000 });
    await expect(items.nth(0)).toContainText('1. 2: MAIN MENU → STOCK');
    await expect(items.nth(1)).toContainText('2. {PgDn}: STOCK → STOCK');
    await expect(items.nth(2)).toContainText('3. {Esc}: STOCK → MAIN MENU');
    await expect(items.nth(3)).toContainText('4. 3: MAIN MENU → CUSTOMERS');
    await expect(items.nth(4)).toContainText('5. {Esc}: CUSTOMERS → MAIN MENU');
    for (let i = 0; i < 5; i++) {
      await expect(items.nth(i).getByRole('img')).toHaveAttribute(
        'src',
        /^data:image\/png;base64,/,
      );
      await expect(items.nth(i)).toContainText('No data changed');
    }

    await section.getByRole('button', { name: 'Save the séance (5 actions)' }).click();
    const saved = section.getByTestId('seance-saved');
    await expect(saved).toHaveText(/^Saved as session [0-9a-f-]{36}\.$/);
    const id = (await saved.innerText()).match(/[0-9a-f-]{36}/)![0];
    const res = await page.request.get(`${API}/api/sessions/${id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.projectId).toBe('shifa');
    expect(body.actions.map((a: { keys: string }) => a.keys)).toEqual([
      '2',
      '{PgDn}',
      '{Esc}',
      '3',
      '{Esc}',
    ]);
    expect(body.actions[0].screenAfter.model.title.name).toBe('STOCK');
    expect(body.audio).toBeUndefined();
  });

  test("records the owner's voice with the keys (fake microphone)", async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    const { section } = await start(page);
    await section.getByRole('button', { name: 'Record my voice too' }).click();
    await expect(section.getByText('Recording your voice')).toBeVisible();
    await section.getByRole('application').click();
    await page.keyboard.press('2');
    await expect(
      section.getByRole('list', { name: 'Séance timeline' }).getByRole('listitem'),
    ).toHaveCount(1, {
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
    await section.getByRole('button', { name: 'Save the séance (1 action)' }).click();
    const saved = section.getByTestId('seance-saved');
    await expect(saved).toBeVisible({ timeout: 20_000 });
    const id = (await saved.innerText()).match(/[0-9a-f-]{36}/)![0];
    const body = await (await page.request.get(`${API}/api/sessions/${id}`)).json();
    expect(body.audio.mime).toMatch(/^audio\//);
    expect(body.audio.base64.length).toBeGreaterThan(100);
  });
});
