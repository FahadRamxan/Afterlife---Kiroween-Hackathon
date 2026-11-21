// @spec vessel-receipts#3 Receipts in the reborn app.
// @spec vessel-receipts#3.1 A saved bill as a receipt: its layout, its text and its PDF.
import type { Soul } from '@afterlife/soul';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  RECEIPT_WIDTH,
  receiptLayout,
  receiptOf,
  receiptPdf,
  receiptText,
  receiptWhatsApp,
  type Receipt,
} from './receipt';
import { createVessel } from './runtime';
import { SHIFA, SHIFA_TODAY, shifaStore } from './testing/shifa';

async function saved(lines: { CODE: string; QTY: string }[], cust = '', soul: Soul = SHIFA) {
  const store = await shifaStore();
  const v = createVessel(soul, store, { today: () => SHIFA_TODAY });
  const r = await v.performAction('save-bill', { values: { CUST_ID: cust }, lines });
  if (!r.ok) throw new Error(JSON.stringify(r.refused));
  return { r, store, receipt: await receiptOf(soul, 'save-bill', r, store) };
}

describe('receiptOf', () => {
  it('the bill-discount bill, as the NEW BILL screen showed it before F2', async () => {
    const { receipt } = await saved([{ CODE: 'INS100', QTY: '8' }], 'C0002');
    expect(receipt).toEqual({
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
      rows: [['1', 'INS100', 'INSULIN MIXTARD 10ML', 'I98021', '650.00', '8', '5200.00']],
      totals: [
        { label: 'SUBTOTAL', value: '5200.00' },
        { label: 'DISCOUNT 10%', value: '520.00' },
        { label: 'GST 17%', value: '795.60' },
        { label: 'TOTAL', value: '5475.60' },
      ],
    });
  });

  it('a walk-in is shown as the old app showed it: WALK-IN', async () => {
    const { receipt } = await saved([{ CODE: 'PAN500', QTY: '2' }]);
    expect(receipt.header[2]).toEqual({ label: 'Customer', value: 'WALK-IN' });
  });

  it('with no layout in the Soul, a default from the action’s fields', async () => {
    const soul: Soul = {
      ...SHIFA,
      actions: SHIFA.actions.map((a) => ({ ...a, receipt: undefined })),
    };
    const layout = receiptLayout(soul, 'save-bill');
    expect(layout.columns.map((c) => c.ref)).toEqual([
      '#',
      'bill-item.CODE',
      'bill-item.QTY',
      'bill-item.PRICE',
      'bill-item.AMOUNT',
    ]);
    expect(layout.totals.map((c) => c.ref)).toEqual([
      'bill.SUBTOTAL',
      'bill.DISCOUNT',
      'bill.GST',
      'bill.TOTAL',
    ]);
    const { receipt } = await saved([{ CODE: 'PAN500', QTY: '2' }], '', soul);
    expect(receipt.rows).toEqual([['1', 'PAN500', '2', '12.50', '25.00']]);
    expect(receipt.totals.at(-1)).toEqual({ label: 'TOTAL', value: '29.25' });
  });

  it('every line and every total of any saved bill is on its receipt (invariant)', async () => {
    const code = fc.constantFrom('PAN500', 'BRU400', 'FLA400', 'DIS500', 'INS100', 'ZAN150');
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.record({ CODE: code, QTY: fc.integer({ min: 1, max: 3 }).map(String) }), {
          minLength: 1,
          maxLength: 5,
          selector: (l) => l.CODE,
        }),
        async (lines) => {
          const { r, receipt } = await saved(lines);
          expect(receipt.rows).toHaveLength(lines.length);
          receipt.rows.forEach((row, i) => {
            expect(row[1]).toBe(lines[i]!.CODE);
            expect(row[5]).toBe(lines[i]!.QTY);
          });
          expect(receipt.totals.map((t) => t.value)).toEqual(
            ['SUBTOTAL', 'DISCOUNT', 'GST', 'TOTAL'].map((f) => String(r.record[f])),
          );
        },
      ),
      { numRuns: Math.min(Number(process.env.FC_NUM_RUNS ?? 100), 200) },
    );
  });
});

// Brackets and backslashes (escaped in a PDF string), Latin-1 and Urdu (not in Courier).
const text = fc.string({ unit: fc.constantFrom(...'ab XY09.-:#()\\éش'), maxLength: 30 });
const receipt: fc.Arbitrary<Receipt> = fc.integer({ min: 1, max: 5 }).chain((n) =>
  fc.record({
    shop: fc.string({ minLength: 1, maxLength: 40 }),
    header: fc.array(fc.record({ label: text, value: text }), { maxLength: 4 }),
    columns: fc.array(
      fc.record({ label: text, align: fc.constantFrom('left' as const, 'right' as const) }),
      { minLength: n, maxLength: n },
    ),
    rows: fc.array(fc.array(text, { minLength: n, maxLength: n }), { maxLength: 30 }),
    totals: fc.array(fc.record({ label: text, value: text }), { maxLength: 5 }),
  }),
);

describe('receiptText and receiptWhatsApp', () => {
  it('the bill as plain lines, no wider than an 80 mm printer', async () => {
    const { receipt: r } = await saved([{ CODE: 'INS100', QTY: '8' }], 'C0002');
    const lines = receiptText(r).split('\n');
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(RECEIPT_WIDTH);
    expect(lines).toContain('BILL NO: 9807-0001');
    expect(lines).toContain('Customer: C0002 NASREEN BIBI');
    expect(lines.some((l) => /^TOTAL +5475\.60$/.test(l))).toBe(true);
    const url = new URL(receiptWhatsApp(r));
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toBe(`\`\`\`\n${receiptText(r)}\n\`\`\``);
  });

  it('every header value, cell and total is in the text, in order (invariant)', () => {
    fc.assert(
      fc.property(receipt, (r) => {
        // A line too long for the paper is wrapped, so spaces and line ends are left out here.
        const t = receiptText(r).replace(/\s+/g, '');
        let at = 0;
        // Each line is printed as its words (and its number) first, then its amounts under them.
        const word = (i: number) => i === 0 || r.columns[i]!.align === 'left';
        const values = [
          ...r.header.map((h) => h.value),
          ...r.rows.flatMap((row) => [
            ...row.filter((_, i) => word(i)),
            ...row.filter((_, i) => !word(i)),
          ]),
          ...r.totals.map((x) => x.value),
        ].map((v) => v.replace(/\s+/g, ''));
        for (const v of values.filter(Boolean)) {
          const i = t.indexOf(v, at);
          expect(i, v).toBeGreaterThanOrEqual(0);
          at = i;
        }
      }),
    );
  });
});

const decode = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

describe('receiptPdf', () => {
  it('a one-page PDF, 80 mm wide, in Courier', async () => {
    const { receipt: r } = await saved([{ CODE: 'INS100', QTY: '8' }], 'C0002');
    const pdf = decode(receiptPdf(r));
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toMatch(/\/MediaBox \[0 0 226\.77 \d+(\.\d+)?\]/);
    expect(pdf).toContain('/BaseFont /Courier');
    expect(pdf).toContain('(TOTAL');
    expect(pdf).toContain('5475.60) Tj');
  });

  it('is well formed for any receipt: its cross-references point at its objects (invariant)', () => {
    fc.assert(
      fc.property(receipt, (r) => {
        const pdf = decode(receiptPdf(r));
        expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
        // Only 7-bit text: anything else is escaped.
        expect([...pdf].every((ch) => ch === '\n' || (ch >= ' ' && ch <= '~'))).toBe(true);
        const start = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)![1]);
        expect(pdf.slice(start, start + 4)).toBe('xref');
        const offsets = [...pdf.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
          Number(m[1]),
        );
        expect(offsets).toHaveLength(5);
        offsets.forEach((o, i) => expect(pdf.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`));
        const len = Number(/\/Length (\d+)/.exec(pdf)![1]);
        const s = pdf.indexOf('stream\n') + 7;
        expect(pdf.slice(s + len, s + len + 10)).toBe('\nendstream');
        // One line of text per receipt line.
        expect(pdf.match(/\) Tj/g)).toHaveLength(receiptText(r).split('\n').length);
      }),
    );
  });
});
