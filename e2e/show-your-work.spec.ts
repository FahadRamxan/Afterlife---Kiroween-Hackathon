// Prompt 47: "Show your work" lists every model call the Crew made for a project, with its token
// budget. No agent calls the model yet (the Possessor does from Prompt 48), so the first test is
// the real API's empty list; the second gives the page a list of calls in the API's shape.
import { expect, test } from '@playwright/test';

async function raiseShifa(page: import('@playwright/test').Page) {
  await page.goto('/graveyard');
  await page.getByRole('button', { name: 'Raise Shifa Medical Store' }).click();
  await expect(page).toHaveURL(/\/raise\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  return page.url().split('/').at(-1)!;
}

test('a new project has made no model calls and has its whole token budget', async ({ page }) => {
  await raiseShifa(page);
  const work = page.getByTestId('show-your-work');
  await expect(work.getByRole('heading', { name: 'Show your work' })).toBeVisible();
  await expect(work.getByTestId('llm-budget')).toHaveText('0 of 200,000 tokens used');
  await expect(work.getByTestId('llm-calls-empty')).toContainText('No model calls yet');
  await expect(work.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
});

test('each call shows who asked, why, how it went and its cost, and opens to its request and response', async ({
  page,
}) => {
  const id = await raiseShifa(page);
  const calls = [
    {
      id: '0192f5a0-0000-7000-8000-000000000002',
      at: '2026-11-01T10:00:02.000Z',
      agent: 'possessor',
      purpose: 'a quantity for the bill',
      provider: 'fake',
      model: 'fake-model',
      attempt: 2,
      status: 'ok',
      inputTokens: 130,
      outputTokens: 10,
      durationMs: 700,
      error: null,
    },
    {
      id: '0192f5a0-0000-7000-8000-000000000001',
      at: '2026-11-01T10:00:01.000Z',
      agent: 'possessor',
      purpose: 'a quantity for the bill',
      provider: 'fake',
      model: 'fake-model',
      attempt: 1,
      status: 'invalid',
      inputTokens: 100,
      outputTokens: 20,
      durationMs: 800,
      error: 'quantity: expected number, received string',
    },
  ];
  await page.route(`**/api/projects/${id}/llm-calls`, (route) =>
    route.fulfill({
      json: { projectId: id, budget: { tokens: 200_000, used: 260 }, total: 2, calls },
    }),
  );
  await page.route(`**/api/projects/${id}/llm-calls/${calls[1]!.id}`, (route) =>
    route.fulfill({
      json: {
        ...calls[1],
        request: { messages: [{ role: 'user', content: [{ type: 'text', text: 'How many?' }] }] },
        response: {
          content: [{ type: 'tool_use', id: 't1', name: 'answer', input: { quantity: 'two' } }],
        },
      },
    }),
  );
  await page.reload();
  const work = page.getByTestId('show-your-work');
  await expect(work.getByTestId('llm-budget')).toHaveText('260 of 200,000 tokens used');
  const rows = work.getByTestId('llm-call');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('possessor');
  await expect(rows.nth(0)).toContainText('Answered');
  await expect(rows.nth(0)).toContainText('attempt 2');
  await expect(rows.nth(0)).toContainText('140 tokens');
  await expect(rows.nth(1)).toHaveAttribute('data-status', 'invalid');
  await expect(rows.nth(1)).toContainText('Answer refused: did not fit its schema');
  await expect(rows.nth(1)).toContainText('quantity: expected number');
  await rows.nth(1).locator('summary').click();
  await expect(rows.nth(1).getByTestId('llm-call-request')).toContainText('How many?');
  await expect(rows.nth(1).getByTestId('llm-call-response')).toContainText('"quantity": "two"');
});
