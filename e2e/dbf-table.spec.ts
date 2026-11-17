import { expect, test, type Locator, type Page } from '@playwright/test';

const grid = (page: Page) => page.getByRole('grid', { name: 'MEDICINE.DBF (Shifa, 40 medicines)' });
const diffGrid = (page: Page) => page.getByRole('grid', { name: 'MEDICINE.DBF changes' });
const focused = (page: Page) => page.locator(':focus');

/** True if the element is what the user actually sees at its centre (not covered or clipped). */
async function onTop(el: Locator) {
  return el.evaluate((node) => {
    // elementFromPoint skips pointer-events: none (as tooltips are), so allow hits just for the check.
    const el = node as HTMLElement;
    const before = el.style.pointerEvents;
    el.style.pointerEvents = 'auto';
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    el.style.pointerEvents = before;
    return hit !== null && (hit === el || el.contains(hit));
  });
}

async function focusFirstCell(g: Locator) {
  await g.locator('[data-cell="0-0"]').click();
  await expect(g.locator('[data-cell="0-0"]')).toBeFocused();
}

test.describe('DbfTable on /design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design');
  });

  test('shows the real Shifa stock file with field types in the header', async ({ page }) => {
    const g = grid(page);
    await expect(g).toHaveAttribute('aria-rowcount', '41');
    await expect(g).toHaveAttribute('aria-colcount', '7');
    const headers = g.getByRole('columnheader');
    await expect(headers).toHaveText([
      '#',
      'CODEC(6)',
      'NAMEC(20)',
      'BATCHC(8)',
      'EXPIRYD',
      'PRICEN(8,2)',
      'QTYN(5)',
    ]);
    const first = g.getByRole('row').nth(1);
    await expect(first).toContainText('PAN500');
    await expect(first).toContainText('PANADOL 500MG STRIP');
    await expect(first).toContainText('31/12/1999');
    await expect(first).toContainText('12.50');
  });

  test('the first record sits right under the header, with no empty row between', async ({
    page,
  }) => {
    const rows = grid(page).getByRole('row');
    const header = (await rows.nth(0).boundingBox())!;
    const first = (await rows.nth(1).boundingBox())!;
    expect(Math.abs(first.y - (header.y + header.height))).toBeLessThanOrEqual(1);
  });

  test('every header fits its name and type without touching the next column', async ({ page }) => {
    const headers = grid(page).getByRole('columnheader');
    for (let i = 1; i < (await headers.count()); i++) {
      const fits = await headers.nth(i).evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits, await headers.nth(i).innerText()).toBe(true);
    }
  });

  test('is virtualised: only the visible rows are in the page', async ({ page }) => {
    const rendered = await grid(page).getByRole('row').count();
    expect(rendered - 1).toBeLessThan(40);
    expect(rendered - 1).toBeGreaterThan(5);
  });

  test('arrow keys move the focused cell, and only one cell is in the tab order', async ({
    page,
  }) => {
    const g = grid(page);
    await focusFirstCell(g);
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).toHaveText('PAN500');
    await page.keyboard.press('ArrowDown');
    await expect(focused(page)).toHaveText('BRU400');
    await page.keyboard.press('ArrowLeft');
    await expect(focused(page)).toHaveText('2');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); // stays on the first row
    await expect(focused(page)).toHaveText('1');
    await expect(g.locator('[tabindex="0"]')).toHaveCount(1);
  });

  test('Home and End go to the start and end of the row', async ({ page }) => {
    const g = grid(page);
    await focusFirstCell(g);
    await page.keyboard.press('End');
    await expect(focused(page)).toHaveText('240'); // QTY of PAN500
    await page.keyboard.press('Home');
    await expect(focused(page)).toHaveText('1');
  });

  test('PageDown moves 10 rows and scrolls a virtual row into view', async ({ page }) => {
    const g = grid(page);
    await focusFirstCell(g);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expect(focused(page)).toHaveText('RIS001'); // record 21
    await expect(focused(page)).toBeInViewport();
    await page.keyboard.press('PageUp');
    await expect(focused(page)).toHaveText('ZAN150'); // record 11
  });

  test('Ctrl+End reaches the last record, which was not rendered before', async ({ page }) => {
    const g = grid(page);
    await expect(g.getByText('THY050')).toHaveCount(0);
    await focusFirstCell(g);
    await page.keyboard.press('Control+End');
    await expect(focused(page)).toHaveText('3'); // QTY of THY050, the 40th record
    await expect(g.getByRole('row').filter({ hasText: 'THY050' })).toHaveAttribute(
      'aria-rowindex',
      '41',
    );
    await expect(focused(page)).toBeInViewport();
    await page.keyboard.press('Control+Home');
    await expect(focused(page)).toHaveText('1');
  });

  test('Tab leaves the grid instead of walking every cell', async ({ page }) => {
    const g = grid(page);
    await focusFirstCell(g);
    await page.keyboard.press('Tab');
    await expect(g.locator(':focus')).toHaveCount(0);
  });
});

test.describe('DbfDiffView on /design', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design');
  });

  test('counts the changes in a legend', async ({ page }) => {
    const legend = page.getByLabel('MEDICINE.DBF changes changes');
    await expect(legend).toContainText('Inserted1');
    await expect(legend).toContainText('Deleted1');
    await expect(legend).toContainText('Changed2');
    await expect(legend).toContainText('2 changed cells, matched by CODE');
  });

  test('colours rows by kind and says so in text', async ({ page }) => {
    const g = diffGrid(page);
    const changed = g.getByRole('row').filter({ hasText: 'PAN500' });
    await expect(changed).toHaveAttribute('data-kind', 'changed');
    const qty = changed.getByRole('gridcell').last();
    // The accessible name is the value; the hidden tooltip is not part of it.
    await expect(qty).toHaveAccessibleName('236');
    await expect(qty).toHaveClass(/bg-candle\/20/); // amber: a changed value

    await g.locator('[data-cell="0-0"]').click();
    await page.keyboard.press('Control+End');
    const inserted = g.getByRole('row').filter({ hasText: 'ZIN020' });
    await expect(inserted).toHaveAttribute('data-kind', 'inserted');
    await expect(inserted.getByRole('rowheader')).toContainText('inserted');

    const deleted = g.getByRole('row').filter({ hasText: 'AMP500' });
    await expect(deleted).toHaveAttribute('data-kind', 'deleted');
    await expect(deleted).toHaveCSS('text-decoration-line', 'line-through');
  });

  test('a changed cell shows old → new on hover and on keyboard focus', async ({ page }) => {
    const g = diffGrid(page);
    const qty = g.getByRole('row').filter({ hasText: 'PAN500' }).getByRole('gridcell').last();
    // aria-hidden (so it is not part of the cell's name), so found by role attribute, not getByRole.
    const tip = qty.locator('[role="tooltip"]');
    await expect(tip).toBeHidden();
    await qty.hover();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText('240 → 236');
    // toBeVisible only checks size. Also check nothing is painted over it (another row, the edge).
    await expect.poll(() => onTop(tip)).toBe(true);
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();

    await g.locator('[data-cell="0-0"]').click();
    await page.keyboard.press('End');
    await expect(focused(page)).toHaveAccessibleName('236');
    await expect(tip).toBeVisible();
    await expect(qty).toHaveAttribute('aria-describedby', (await tip.getAttribute('id'))!);
    await expect(qty).toHaveAccessibleDescription('240 → 236');
    await expect.poll(() => onTop(tip)).toBe(true);
  });
});

test('in Urdu the tables keep the file order, left to right', async ({ page, context }) => {
  await context.addCookies([
    { name: 'afterlife-locale', value: 'ur', url: 'http://localhost:3000' },
  ]);
  await page.goto('/design');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const g of [grid(page), diffGrid(page)]) {
    await expect(g).toHaveCSS('direction', 'ltr');
    const first = await g.getByRole('columnheader').first().boundingBox();
    const second = await g.getByRole('columnheader').nth(1).boundingBox();
    expect(first!.x, '# is the left-most column').toBeLessThan(second!.x);
  }
  await expect(page.getByText('2 changed cells, matched by CODE')).toHaveCSS('direction', 'ltr');
});

test('DbfTable scrolls sideways at 360 px instead of breaking the page', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/design');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const g = grid(page);
  await focusFirstCell(g);
  await page.keyboard.press('End');
  await expect(focused(page)).toHaveText('240');
  await expect(focused(page)).toBeInViewport();
});
