// Prompt 57: rules being exhumed in the Soul tab. A new Soul version arrives while the tab is open
// (its live soul_updated event): each new rule lights a candle and writes itself in, then its
// evidence flies in as small screens of the old app, and the banner counts match the API. The
// rules are the reference Soul of Shifa (no model on this machine), pointing at a real observation
// from a séance on the live Shifa EXE.
import { expect, test, type Page } from '@playwright/test';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';

const API = 'http://localhost:4000';

/** Raise Shifa, let the pipeline finish (it stores the first Soul), and record a one-key séance. */
async function raised(page: Page) {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const projectId = page.url().split('/').at(-1)!;
  await expect(page.getByTestId('steps').getByRole('progressbar')).toHaveAccessibleName(
    /^6 of 6 steps run/,
    { timeout: 180_000 },
  );
  const seance = page.getByRole('region', { name: 'Record a séance' });
  await seance.getByRole('button', { name: 'Record a séance' }).click();
  await expect(seance.getByTestId('seance-screen')).toHaveText('MAIN MENU', { timeout: 60_000 });
  await seance
    .getByRole('application', { name: 'Shifa Medical Store keyboard: type here' })
    .click();
  await page.keyboard.press('2');
  await seance
    .getByRole('button', { name: 'Save the séance (1 action)' })
    .click({ timeout: 30_000 });
  await expect(seance.getByTestId('seance-saved')).toBeVisible();
  const seanceObs = (
    (await (await page.request.get(`${API}/api/projects/${projectId}/observations`)).json())
      .observations as { id: string; keys: string; sessionId: string | null }[]
  ).filter((o) => o.sessionId);
  expect(seanceObs).toHaveLength(1);
  return { projectId, evidence: seanceObs[0]!.id };
}

async function exhume(page: Page, projectId: string, evidence: string) {
  const soul = {
    ...SHIFA_REFERENCE_SOUL,
    rules: SHIFA_REFERENCE_SOUL.rules.map((r) => ({ ...r, evidence: [evidence] })),
  };
  const res = await page.request.post(`${API}/api/projects/${projectId}/souls`, { data: soul });
  expect(res.status()).toBe(201);
}

async function apiCounts(page: Page, projectId: string) {
  const soul = await (await page.request.get(`${API}/api/projects/${projectId}/soul`)).json();
  const obs = await (
    await page.request.get(`${API}/api/projects/${projectId}/observations`)
  ).json();
  return { rules: soul.soul.rules.length as number, observations: obs.total as number };
}

const banner = (n: { rules: number; observations: number }) =>
  `${n.rules} ${n.rules === 1 ? 'rule' : 'rules'} exhumed from ${n.observations} ${
    n.observations === 1 ? 'observation' : 'observations'
  }`;

test.describe('rule discovery', () => {
  test.setTimeout(330_000);

  test('new rules light a candle, write themselves in, bring their evidence, and are counted', async ({
    page,
  }) => {
    const { projectId, evidence } = await raised(page);
    await page.getByRole('tab', { name: 'Soul', exact: true }).click();
    const panel = page.getByTestId('soul');
    // The pipeline's Soul: entities, no rules yet (there is no model here).
    await expect(page.getByTestId('exhumed-banner')).toHaveText(
      banner(await apiCounts(page, projectId)),
    );

    await exhume(page, projectId, evidence);
    const rule = page.getByTestId('rule-discount-over-5000');
    await expect(rule).toHaveAttribute('data-fresh', 'true', { timeout: 20_000 });
    await expect(rule.getByTestId('rule-fresh')).toHaveText('Just exhumed');
    // It writes itself in, then stops: the whole sentence.
    await expect(rule).toHaveAttribute('data-typed', 'true', { timeout: 20_000 });
    await expect(rule.getByTestId('rule-en')).toHaveText(
      SHIFA_REFERENCE_SOUL.rules.find((r) => r.id === 'discount-over-5000')!.en,
    );
    // Then its evidence flies in: the old app's screen after the key, as a small CRT.
    const thumb = rule.getByTestId('evidence-thumb');
    await expect(thumb).toHaveCount(1);
    await expect(thumb.getByRole('button', { name: 'Evidence 1: keys 2' })).toBeVisible();
    await expect(thumb).toContainText('STOCK');
    await thumb.getByRole('button').click();
    await expect(
      page.getByRole('dialog', { name: 'Evidence: what the old app did' }),
    ).toContainText('Keys pressed: 2');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    // Every new rule did the same, and the banner counts what the API has.
    await expect(panel.locator('[data-fresh="true"]')).toHaveCount(
      SHIFA_REFERENCE_SOUL.rules.length,
    );
    const counts = await apiCounts(page, projectId);
    expect(counts.rules).toBe(SHIFA_REFERENCE_SOUL.rules.length);
    // The reference Soul was written by a person: its rules are not said to be exhumed (review of
    // 51-60, finding 7).
    await expect(page.getByTestId('exhumed-banner')).toHaveText(
      `${counts.rules} rules written by our team (the reference Soul), not exhumed from the observations`,
    );

    await page.request.delete(`${API}/api/projects/${projectId}`);
  });

  test('under reduced motion the rules appear whole and nothing flies', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { projectId, evidence } = await raised(page);
    await page.getByRole('tab', { name: 'Soul', exact: true }).click();
    await expect(page.getByTestId('exhumed-banner')).toBeVisible({ timeout: 15_000 });
    await exhume(page, projectId, evidence);
    const rule = page.getByTestId('rule-gst-17-truncated');
    await expect(rule).toHaveAttribute('data-fresh', 'true', { timeout: 20_000 });
    await expect(rule).toHaveAttribute('data-typed', 'true');
    const thumb = rule.getByTestId('evidence-thumb');
    await expect(thumb).toHaveCount(1);
    expect(await thumb.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await page.request.delete(`${API}/api/projects/${projectId}`);
  });
});
