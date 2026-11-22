// @spec vessel-receipts#3.2 A snapshot of the receipt's HTML (Prompt 61).
import type { Receipt } from '@afterlife/vessel';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReceiptPaper } from '../components/ReceiptPaper';

/** The bill-discount bill and a Panadol strip, as receiptOf gives it (packages/vessel). */
const BILL: Receipt = {
  shop: 'Shifa Medical Store',
  header: [
    { label: 'BILL NO', value: '9807-0001' },
    { label: 'DATE', value: '15/07/98' },
    { label: 'Customer', value: 'C0002 NASREEN BIBI' },
  ],
  columns: [
    { label: '#', align: 'right' },
    { label: 'CODE', align: 'left' },
    { label: 'NAME', align: 'left' },
    { label: 'BATCH', align: 'left' },
    { label: 'PRICE', align: 'right' },
    { label: 'QTY', align: 'right' },
    { label: 'AMOUNT', align: 'right' },
  ],
  rows: [
    ['1', 'INS100', 'INSULIN MIXTARD 10ML', 'I98021', '650.00', '8', '5200.00'],
    ['2', 'PAN500', 'PANADOL 500MG STRIP', 'B98031', '12.50', '1', '12.50'],
  ],
  totals: [
    { label: 'SUBTOTAL', value: '5212.50' },
    { label: 'DISCOUNT 10%', value: '521.25' },
    { label: 'GST 17%', value: '797.51' },
    { label: 'TOTAL', value: '5488.76' },
  ],
};

const html = (r: Receipt) => renderToStaticMarkup(createElement(ReceiptPaper, { receipt: r }));

describe('ReceiptPaper', () => {
  it('a bill: the shop, header, lines and totals in the old app’s order', async () => {
    // Pretty-printed one tag a line, so a change reads well in review.
    await expect(html(BILL).replace(/></g, '>\n<')).toMatchFileSnapshot(
      '__snapshots__/receipt-paper.html',
    );
  });

  it('the old app’s words left to right, and the total in bold', () => {
    const out = html(BILL);
    expect(out).toMatch(
      /^<div data-testid="receipt-paper" class="vessel-receipt-paper [^"]*" lang="en" dir="ltr">/,
    );
    expect(out).toContain('<div class="flex justify-between font-bold"><dt>TOTAL</dt>');
  });

  it('a receipt with no lines (a fee paid) has no table', () => {
    const fee = { ...BILL, columns: [], rows: [] };
    expect(html(fee)).not.toContain('<table');
  });
});
