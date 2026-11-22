// @spec vessel-receipts#3.3 Prompt 61 done when: the receipt of a bill made in the reborn app,
// its print preview (80 mm, nothing else printed), the WhatsApp link and the PDF download.
// One bill for all of it: each raise waits its turn for the worker, so the suite raises few.
import { expect, test } from '@playwright/test';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';
import { API, raiseShifaWithSoul } from './helpers/raise';

test('a saved bill’s receipt: the old bill screen’s fields, print, WhatsApp, PDF and Urdu', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const id = await raiseShifaWithSoul(page, SHIFA_REFERENCE_SOUL, { recorded: true });
  await page.goto(`/vessel/${id}`);
  await expect(page.getByTestId('vessel-app')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Customer (blank: walk-in)').fill('C0002');
  await page.getByRole('combobox', { name: 'Add a Medicine' }).fill('insu');
  await page
    .getByRole('option')
    .getByRole('button', { name: /INSULIN MIXTARD 10ML/ })
    .click();
  for (let i = 0; i < 7; i++)
    await page.getByRole('button', { name: 'One more on line 1' }).click();
  await page.getByTestId('vessel-totals').getByRole('button', { name: 'Save bill' }).click();
  await expect(page.getByTestId('vessel-saved')).toHaveText(
    'Bill 9807-0001 saved. Total Rs 5,475.60.',
  );

  // The receipt: the fields of the old NEW BILL screen, in its order.
  const paper = page.getByTestId('receipt-paper');
  await expect(paper).toContainText('Shifa Medical Store');
  await expect(paper).toContainText('BILL NO:9807-0001');
  await expect(paper).toContainText('DATE:15/07/98');
  await expect(paper).toContainText('Customer:C0002 NASREEN BIBI');
  await expect(paper.getByRole('columnheader')).toHaveText([
    '#',
    'CODE',
    'NAME',
    'BATCH',
    'PRICE',
    'QTY',
    'AMOUNT',
  ]);
  await expect(paper.getByRole('row').nth(1).getByRole('cell')).toHaveText([
    '1',
    'INS100',
    'INSULIN MIXTARD 10ML',
    'I98021',
    '650.00',
    '8',
    '5200.00',
  ]);
  await expect(paper.locator('dl').last()).toHaveText(
    'SUBTOTAL5200.00DISCOUNT 10%520.00GST 17%795.60TOTAL5475.60',
  );

  // WhatsApp gets the receipt as text.
  const link = page.getByRole('link', { name: 'Send on WhatsApp' });
  const href = new URL((await link.getAttribute('href'))!);
  expect(href.origin).toBe('https://wa.me');
  const text = href.searchParams.get('text')!;
  expect(text).toContain('Customer: C0002 NASREEN BIBI');
  expect(text).toMatch(/\nTOTAL +5475\.60\n/);
  await expect(link).toHaveAttribute('target', '_blank');

  // The PDF, made on the phone.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download PDF' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('receipt-9807-0001.pdf');
  const chunks: Buffer[] = [];
  for await (const c of (await download.createReadStream())!) chunks.push(c as Buffer);
  const pdf = Buffer.concat(chunks).toString('latin1');
  expect(pdf.startsWith('%PDF-1.4')).toBe(true);
  expect(pdf).toContain('(TOTAL');
  expect(pdf).toContain('5475.60) Tj');

  // Print: the button opens the browser's dialog.
  await page.evaluate(() => {
    const w = window as unknown as { printed: number };
    w.printed = 0;
    window.print = () => void w.printed++;
  });
  await page.getByRole('button', { name: 'Print receipt' }).click();
  expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

  // The print preview: the receipt alone, 80 mm wide, black on white.
  await page.emulateMedia({ media: 'print' });
  await expect(paper).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Reborn app' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print receipt' })).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Add a Medicine' })).toBeHidden();
  const box = (await paper.boundingBox())!;
  // 80 mm at 96 dpi is 302.4 px.
  expect(Math.abs(box.width - (80 / 25.4) * 96)).toBeLessThan(1.5);
  expect(box.x).toBeLessThan(1);
  const style = await paper.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.color, s.backgroundColor, s.fontFamily];
  });
  expect(style.slice(0, 2)).toEqual(['rgb(0, 0, 0)', 'rgb(255, 255, 255)']);
  expect(style[2]).toMatch(/Plex Mono|monospace/i);
  await page.emulateMedia({ media: 'screen' });

  // In Urdu the buttons are Urdu, and the receipt keeps the old app's English, left to right.
  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'اردو' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ur');
  await expect(page.getByRole('button', { name: 'رسید پرنٹ کریں' })).toBeVisible();
  await expect(paper).toHaveAttribute('dir', 'ltr');
  await expect(paper).toContainText('SUBTOTAL');

  // The next bill clears the receipt (the medicine search, whatever its Urdu name).
  const search = page.locator('input[type="search"][role="combobox"]');
  await search.fill('pan5');
  await search.press('Enter');
  await expect(page.getByTestId('vessel-receipt')).toHaveCount(0);
  await page.request.delete(`${API}/api/projects/${id}`);
});
