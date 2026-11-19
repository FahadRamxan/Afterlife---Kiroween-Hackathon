// Prompt 33: a bill Kiro made in the real Shifa (js-dos) through the afterlife-emulator MCP
// server. The fixture holds the tools' results as they came back in that chat. Here the reference
// Soul's own rules work the bill out again, and must agree with what the old app saved.
import { readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { evaluate, parseExpr, type Env } from '../dsl';
import { SHIFA_REFERENCE_SOUL } from './shifa';

type Call = { tool: string; args: Record<string, unknown>; result: string };
const FIXTURE = JSON.parse(
  readFileSync(new URL('./__fixtures__/mcp-pan500-bill.json', import.meta.url), 'utf8'),
) as { calls: Call[] };

const result = (tool: string, file?: string) =>
  FIXTURE.calls.find((c) => c.tool === tool && (file === undefined || c.args.file === file))!
    .result;

/** read_table's text: a count line, a header line, then one `|`-separated line per record. */
function table(text: string): Record<string, string>[] {
  const [, head, ...rows] = text.split('\n');
  const names = head!.split(' | ');
  return rows.map((r) => Object.fromEntries(r.split(' | ').map((v, i) => [names[i]!, v.trim()])));
}

/** diff_data's text: `FILE: n inserted, n deleted, n changed` per file. */
function counts(text: string): Record<string, [number, number, number]> {
  return Object.fromEntries(
    text.split('\n').map((l) => {
      const m = /^(\S+): (\d+) inserted, (\d+) deleted, (\d+) changed$/.exec(l)!;
      return [m[1]!, [Number(m[2]), Number(m[3]), Number(m[4])]];
    }),
  );
}

const rule = (id: string) => SHIFA_REFERENCE_SOUL.rules.find((r) => r.id === id)!;
const run = (id: string, env: Env) =>
  new Decimal((evaluate(parseExpr(rule(id).expression), env) as Decimal).toString()).toFixed(2);

const bill = table(result('read_table', 'BILLS.DBF')).find((b) => b.BILL_NO === '9807-0001')!;
const items = table(result('read_table', 'BILLITEM.DBF')).filter((i) => i.BILL_NO === '9807-0001');

describe('the PAN500 bill Kiro made over MCP', () => {
  it('diff_data: one bill and one bill line inserted, one medicine changed, nothing else', () => {
    expect(counts(result('diff_data'))).toEqual({
      'BILLITEM.DBF': [1, 0, 0],
      'BILLS.DBF': [1, 0, 0],
      'MEDICINE.DBF': [0, 0, 1],
    });
    // The tables it names are the ones read after the save, one record longer than before.
    expect(result('snapshot_data')).toContain('BILLS.DBF: 3 records');
    expect(result('read_table', 'BILLS.DBF')).toMatch(/^BILLS\.DBF: 4 records/);
    expect(result('snapshot_data')).toContain('BILLITEM.DBF: 4 records');
    expect(result('read_table', 'BILLITEM.DBF')).toMatch(/^BILLITEM\.DBF: 5 records/);
  });

  it('the subtotal, discount, GST and total the old app saved are what the Soul rules give', () => {
    expect(items).toEqual([
      {
        BILL_NO: '9807-0001',
        LINE: '1',
        CODE: 'PAN500',
        QTY: '2',
        PRICE: '12.50',
        AMOUNT: '25.00',
      },
    ]);
    const lines = items.map((i) => ({ qty: i.QTY!, price: i.PRICE! }));
    const subtotal = run('bill-subtotal', { items: lines });
    const discount = run('discount-over-5000', { bill: { subtotal } });
    const gst = run('gst-17-truncated', { bill: { subtotal, discount } });
    const total = run('bill-total', { bill: { subtotal, discount, gst } });
    expect({ subtotal, discount, gst, total }).toEqual({
      subtotal: bill.SUBTOTAL,
      discount: bill.DISCOUNT,
      gst: bill.GST,
      total: bill.TOTAL,
    });
    expect(bill).toMatchObject({ BILL_DATE: '19980715', CUST_ID: '' });
    // And the screen showed the same totals when F2 saved it.
    const saved = FIXTURE.calls.find((c) => c.args.keys === '{F2}')!;
    expect(saved.result).toMatch(/SUBTOTAL\s+25\.00/);
    expect(saved.result).toMatch(/GST 17%\s+4\.25/);
    expect(saved.result).toMatch(/TOTAL\s+29\.25/);
    expect(saved.result).toContain('BILL 9807-0001 SAVED');
  });

  it('the stock of PAN500 went down by the quantity sold (the stock-decrement rule)', () => {
    const before = /PAN500 PANADOL 500MG STRIP\s+\S+\s+\S+\s+[\d.]+\s+(\d+)/.exec(
      FIXTURE.calls.find((c) => c.args.keys === '2')!.result,
    )![1]!;
    const after = table(result('read_table', 'MEDICINE.DBF')).find((m) => m.CODE === 'PAN500')!;
    expect(before).toBe('240');
    const expected = new Decimal(
      (
        evaluate(parseExpr(rule('stock-decrement').expression), {
          medicine: { qty: before },
          item: { qty: items[0]!.QTY! },
        }) as Decimal
      ).toString(),
    ).toFixed(0);
    expect(after.QTY).toBe(expected);
    expect(after.QTY).toBe('238');
  });
});
