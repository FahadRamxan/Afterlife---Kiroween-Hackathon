// Prompt 45: every change to a Soul is a new version; the Soul tab lists them and compares two.
import { expect, test } from '@playwright/test';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';
import { API, raiseShifa } from './helpers/raise';

test('the version timeline lists each version and compares two', async ({ page }) => {
  // The pipeline's archaeology step stores a Soul version of its own: wait for it first, so the
  // two versions this test posts are the newest (else the step's could land between them).
  const id = await raiseShifa(page, { recorded: true });
  const before = (await (await page.request.get(`${API}/api/projects/${id}/souls`)).json()) as {
    versions: { version: number }[];
  };
  const a = before.versions.length + 1;
  const b = a + 1;

  await page.request.post(`${API}/api/projects/${id}/souls`, { data: SHIFA_REFERENCE_SOUL });
  const v2 = {
    ...SHIFA_REFERENCE_SOUL,
    provenance: { ...SHIFA_REFERENCE_SOUL.provenance, createdBy: 'owner' },
    rules: [
      {
        ...SHIFA_REFERENCE_SOUL.rules[0]!,
        expression: 'if bill.subtotal > 10000 then trunc(bill.subtotal * 0.10, 2) else 0',
      },
      ...SHIFA_REFERENCE_SOUL.rules.slice(2),
      {
        id: 'sunday-closed',
        kind: 'validate',
        en: 'No bills on Sunday.',
        ur: '',
        expression: 'true',
        evidence: [],
        confidence: 0.5,
      },
    ],
  };
  expect((await page.request.post(`${API}/api/projects/${id}/souls`, { data: v2 })).status()).toBe(
    201,
  );

  await page.goto(`/raise/${id}?tab=soul`);
  const versions = page.getByTestId('soul-versions');
  await expect(versions.getByTestId(`version-${b}`)).toContainText('by the owner');
  await expect(versions.getByTestId(`version-${b}`)).toContainText('1 added, 1 removed, 1 changed');
  await expect(versions.getByTestId(`version-${a}`)).toContainText('by our team (reference)');
  await expect(versions.getByTestId('version-1')).toContainText('the first version');
  await expect(page.getByTestId('soul')).toContainText(`Soul version ${b}`);

  await versions.getByRole('button', { name: 'Compare' }).click();
  const diff = page.getByTestId('soul-diff');
  await expect(diff).toContainText(`From version ${a} to version ${b}`);
  await expect(diff.locator('[data-kind="added"]')).toContainText('sunday-closed');
  await expect(diff.locator('[data-kind="removed"]')).toContainText('gst-17-truncated');
  await expect(diff.locator('[data-kind="changed"]')).toContainText('bill.subtotal > 5000');
  await expect(diff.locator('[data-kind="changed"]')).toContainText('bill.subtotal > 10000');

  await page.request.delete(`${API}/api/projects/${id}`);
});
