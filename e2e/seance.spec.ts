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
    const { section, keyboard } = await start(page);
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
    // Saved once: Save stays off until there is a new action (no duplicate séance).
    await expect(section.getByRole('button', { name: /^Save the séance/ })).toBeDisabled();
    await keyboard.click();
    await page.keyboard.press('2');
    await expect(section.getByRole('button', { name: 'Save the séance (6 actions)' })).toBeEnabled({
      timeout: 30_000,
    });
  });

  test('on a raised project the séance belongs to it: in its timeline, and gone with it', async ({
    page,
  }) => {
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const projectId = page.url().split('/').at(-1)!;
    const section = page.getByRole('region', { name: 'Record a séance' });
    await section.getByRole('button', { name: 'Record a séance' }).click();
    await expect(section.getByTestId('seance-screen')).toHaveText('MAIN MENU', { timeout: 60_000 });
    await section
      .getByRole('application', { name: 'Shifa Medical Store keyboard: type here' })
      .click();
    await page.keyboard.press('2');
    await section
      .getByRole('button', { name: 'Save the séance (1 action)' })
      .click({ timeout: 30_000 });
    const id = (await section.getByTestId('seance-saved').innerText()).match(/[0-9a-f-]{36}/)![0];
    await expect(
      page.getByTestId('timeline').locator('li[data-kind="session_recorded"]'),
    ).toContainText('Séance recorded');
    expect(
      (await (await page.request.get(`${API}/api/sessions/${id}`)).json()).raisedProjectId,
    ).toBe(projectId);
    expect((await page.request.delete(`${API}/api/projects/${projectId}`)).status()).toBe(204);
    expect((await page.request.get(`${API}/api/sessions/${id}`)).status()).toBe(404);
  });

  test('a full séance store says so when saving', async ({ page }) => {
    await page.route('**/api/sessions', (route) =>
      route.fulfill({
        status: 507,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'STORAGE_FULL',
          message: 'The séance storage is full (200 MB). Ask the owner of this site to make room.',
        }),
      }),
    );
    const { section } = await start(page);
    await page.keyboard.press('2');
    await section
      .getByRole('button', { name: 'Save the séance (1 action)' })
      .click({ timeout: 30_000 });
    await expect(section).toContainText('The séance storage is full (200 MB)');
  });

  test('leaving the Possession tab turns the microphone off', async ({ page, context }) => {
    // Found in the Prompts 31 to 40 review: the tab's content unmounts, but the recorder kept
    // the microphone open (the browser's mic light stayed on) with nothing left to stop it.
    await context.grantPermissions(['microphone']);
    await page.addInitScript(() => {
      const w = window as unknown as { __streams: MediaStream[] };
      w.__streams = [];
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => {
        const s = await get(c);
        w.__streams.push(s);
        return s;
      };
    });
    const { section } = await start(page);
    await section.getByRole('button', { name: 'Record my voice too' }).click();
    await expect(section.getByText('Recording your voice')).toBeVisible();
    const tracks = () =>
      page.evaluate(() =>
        (window as unknown as { __streams: MediaStream[] }).__streams
          .flatMap((s) => s.getTracks())
          .map((t) => t.readyState),
      );
    expect(await tracks()).toEqual(['live']);
    await page.getByRole('tab', { name: 'Soul', exact: true }).click();
    await expect(section).toHaveCount(0);
    await expect.poll(tracks).toEqual(['ended']);
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
