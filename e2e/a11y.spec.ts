import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The a11y-check Kiro hook sets A11Y_ROUTES to the pages that were just saved.
// Without it, every known route is checked. Prompt 89 extends this to all routes in both languages.
const routes = (
  process.env.A11Y_ROUTES ??
  '/,/graveyard,/raise/demo,/vessel/demo,/verify/demo,/playground,/design'
)
  .split(',')
  .filter(Boolean);

for (const route of routes) {
  test(`no serious axe violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
