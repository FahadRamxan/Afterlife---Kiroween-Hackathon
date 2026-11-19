// Prompt 44 "done when": open a rule's evidence and download the spec zip. The Soul is the
// reference Soul of Shifa (labelled as such on the page), with its rules pointing at a real
// observation from a séance recorded on the project in this test.
import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';

const API = 'http://localhost:4000';

test.describe('the Soul tab', () => {
  test('shows the entities and rules, opens a rule’s evidence, and downloads the Kiro spec', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    const projectId = page.url().split('/').at(-1)!;

    // A real observation: one key pressed in the live old app, saved as a séance on this project.
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
    const obs = (
      await (await page.request.get(`${API}/api/projects/${projectId}/observations`)).json()
    ).observations as { id: string }[];
    expect(obs).toHaveLength(1);

    const soul = {
      ...SHIFA_REFERENCE_SOUL,
      rules: SHIFA_REFERENCE_SOUL.rules.map((r) => ({ ...r, evidence: [obs[0]!.id] })),
    };
    expect(
      (await page.request.post(`${API}/api/projects/${projectId}/souls`, { data: soul })).status(),
    ).toBe(201);

    await page.getByRole('tab', { name: 'Soul', exact: true }).click();
    const panel = page.getByTestId('soul');
    await expect(panel).toContainText('Soul version 1');
    await expect(page.getByTestId('soul-reference')).toContainText('Reference Soul');
    await expect(page.getByTestId('entity-medicine')).toContainText('MEDICINE.DBF');
    const rule = page.getByTestId('rule-discount-over-5000');
    await expect(rule).toContainText(
      'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
    );
    await expect(rule.getByRole('meter')).toHaveAttribute('value', '1');

    await rule.getByRole('button', { name: 'Evidence 1' }).click();
    const dialog = page.getByRole('dialog', { name: 'Evidence: what the old app did' });
    await expect(dialog).toContainText('Keys pressed: 2');
    await expect(dialog.getByTestId('evidence-before')).toContainText('MAIN MENU');
    await expect(dialog.getByTestId('evidence-after')).toContainText('STOCK');
    await expect(dialog.getByTestId('evidence-diff')).toContainText('No data changed.');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      panel.getByRole('button', { name: 'Download Kiro spec' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('shifa-kiro-spec.zip');
    const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
    const req = strFromU8(files['shifa-kiro-spec/.kiro/specs/shifa-rebirth/requirements.md']!);
    expect(req).toContain(
      'WHEN the bill subtotal is over 5000 THE SYSTEM SHALL set the bill discount',
    );
    expect(req).toContain(obs[0]!.id);
    expect(Object.keys(files)).toContain('shifa-kiro-spec/.kiro/steering/legacy-behaviour.md');

    await page.request.delete(`${API}/api/projects/${projectId}`);
  });

  test('a project without a Soul says so', async ({ page }) => {
    await page.goto('/graveyard');
    await page.getByRole('button', { name: 'Raise Barkat Kiryana Ledger' }).click();
    await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Soul', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('No rules exhumed yet');
  });
});
