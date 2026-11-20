// Prompt 46: rules in Urdu on the Soul tab. The worker translates with the language model; the
// e2e worker has none (no AWS credentials on a laptop), so the first test stores a Soul whose
// Urdu our team wrote for the test, and the second checks that asking for a translation without
// a model says so instead of making text up.
import { expect, test, type Page } from '@playwright/test';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';

const API = 'http://localhost:4000';

/** Written by our team for this test, not by the model. */
const URDU: Record<string, string> = {
  'discount-over-5000':
    'جس بل کا ذیلی ٹوٹل 5,000 روپے سے زیادہ ہو اسے 10% رعایت ملتی ہے، پیسے تک کاٹ کر۔ پورے 5,000 روپے پر کوئی رعایت نہیں۔',
  'gst-17-truncated': 'رعایت کے بعد بل پر 17% جی ایس ٹی لگتا ہے، پیسے تک کاٹ کر (گول کیے بغیر)۔',
};

async function raiseWithSoul(page: Page, soul: unknown) {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = page.url().split('/').at(-1)!;
  const res = await page.request.post(`${API}/api/projects/${id}/souls`, { data: soul });
  expect(res.status()).toBe(201);
  await page.goto(`/raise/${id}?tab=soul`);
  return id;
}

test('with the language toggle on Urdu, the rules are shown in Urdu first', async ({ page }) => {
  const soul = {
    ...SHIFA_REFERENCE_SOUL,
    rules: SHIFA_REFERENCE_SOUL.rules.map((r) => ({ ...r, ur: URDU[r.id] ?? '' })),
  };
  await raiseWithSoul(page, soul);
  const discount = page.getByTestId('rule-discount-over-5000');
  // In English the English comes first and the Urdu follows it.
  await expect(discount.getByTestId('rule-en')).toContainText('gets 10% off');
  await expect(discount.locator('p').first()).toHaveAttribute('data-testid', 'rule-en');
  // Two of the rules have the Urdu our team wrote; the others have none yet.
  await expect(page.getByTestId('urdu-missing')).toHaveText(
    `${SHIFA_REFERENCE_SOUL.rules.length - 2} rules have no Urdu yet.`,
  );

  await page.getByRole('button', { name: 'اردو' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  const ur = discount.getByTestId('rule-ur');
  await expect(ur).toHaveText(URDU['discount-over-5000']!);
  await expect(ur).toHaveAttribute('lang', 'ur');
  await expect(ur).toHaveAttribute('dir', 'rtl');
  await expect(ur).toHaveClass(/font-urdu/);
  await expect(discount.locator('p').first()).toHaveAttribute('data-testid', 'rule-ur');
  // The glossary words: bill, discount, GST.
  await expect(page.getByTestId('rule-gst-17-truncated').getByTestId('rule-ur')).toContainText(
    'جی ایس ٹی',
  );
  await expect(ur).toContainText('بل');
  // Who wrote the Soul is said in Urdu too, not as the API's English word (review 41-50).
  await expect(page.getByTestId('soul')).toContainText('ہماری ٹیم (حوالہ)');
  // The English stays, smaller, for the developer.
  await expect(discount.getByTestId('rule-en')).toContainText('gets 10% off');
  // A rule with no Urdu says so.
  await expect(page.getByTestId('rule-bill-total').getByTestId('rule-ur-missing')).toHaveText(
    'ابھی اردو میں نہیں۔',
  );
});

test('asking for a translation on a worker without a model says so, and changes nothing', async ({
  page,
}) => {
  await raiseWithSoul(page, SHIFA_REFERENCE_SOUL);
  await expect(page.getByTestId('urdu-missing')).toHaveText(
    `${SHIFA_REFERENCE_SOUL.rules.length} rules have no Urdu yet.`,
  );
  await page.getByRole('button', { name: 'Translate rules into Urdu' }).click();
  await expect(page.getByTestId('urdu-failed')).toContainText(
    'No language model is set up on this worker',
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('soul')).toContainText('Soul version 1');
  await expect(page.getByTestId('rule-discount-over-5000').getByTestId('rule-ur')).toHaveCount(0);
});
