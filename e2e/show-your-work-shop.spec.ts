// Review 41-50: an uploaded app is a real shop's. Its model calls are listed, with who asked,
// why and what they cost, but what was sent and answered is not shown to anyone with the link.
// The API part runs on the real Postgres (apps/api llm-calls.pg.test.ts); here the page is given
// the API's answer for such a project.
import { expect, test } from '@playwright/test';

test("a real shop's model calls are listed without what was sent or answered", async ({ page }) => {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  const id = page.url().split('/').at(-1)!;
  const call = {
    id: '0192f5a0-0000-7000-8000-000000000003',
    at: '2026-11-19T10:00:00.000Z',
    agent: 'possessor',
    purpose: 'a value for Code on NEW BILL',
    provider: 'bedrock',
    model: 'us.anthropic.claude-sonnet-5-5',
    attempt: 1,
    status: 'ok',
    inputTokens: 900,
    outputTokens: 20,
    durationMs: 1100,
    error: null,
  };
  await page.route(`**/api/projects/${id}/llm-calls`, (route) =>
    route.fulfill({
      json: {
        projectId: id,
        budget: { tokens: 200_000, used: 920 },
        bodies: 'hidden',
        total: 1,
        calls: [call],
      },
    }),
  );
  await page.route(`**/api/projects/${id}/llm-calls/${call.id}`, (route) =>
    route.fulfill({ json: { ...call, request: null, response: null, hidden: true } }),
  );
  await page.reload();
  const work = page.getByTestId('show-your-work');
  await expect(work.getByTestId('llm-bodies-hidden')).toContainText("This is a real shop's app");
  await expect(work.getByTestId('llm-bodies-hidden')).toContainText(
    'Names and phone numbers are never sent to the model',
  );
  const row = work.getByTestId('llm-call');
  await expect(row).toContainText('a value for Code on NEW BILL');
  await expect(row).toContainText('us.anthropic.claude-sonnet-5-5');
  await row.locator('summary').click();
  await expect(row.getByTestId('llm-call-hidden')).toHaveText(
    'Not shown: this is a real shop’s app.',
  );
  await expect(row.getByTestId('llm-call-request')).toHaveCount(0);
});
