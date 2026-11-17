// Prompt 12: Shifa Medical Store v2.3 (1998). Checks the seed data and the results of the scripted
// DOSBox runs in samples/graveyard/fixtures/shifa. `pnpm graveyard:test` re-runs every scenario in
// DOSBox and fails if the output differs by one byte from these committed fixtures.
// The expected numbers here were worked out by hand, not copied from the app's output.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRAVEYARD, readScreen, readTable, readText, scenarios } from './helpers/graveyard';

const fx = (scenario: string, file: string) => `fixtures/shifa/${scenario}/${file}`;
const seed = (name: string) => readTable(`shifa/seed/${name}.csv`);
const byCode = (scenario: string) =>
  Object.fromEntries(readTable(fx(scenario, 'MEDICINE.csv')).rows.map((r) => [r.CODE, r]));
const lastBill = (scenario: string) => readTable(fx(scenario, 'BILLS.csv')).rows.at(-1)!;
const items = (scenario: string, billNo: string) =>
  readTable(fx(scenario, 'BILLITEM.csv')).rows.filter((r) => r.BILL_NO === billNo);

describe('seed data', () => {
  const med = seed('MEDICINE');

  it('has 40 medicines with unique codes', () => {
    expect(med.rows).toHaveLength(40);
    expect(new Set(med.rows.map((r) => r.CODE)).size).toBe(40);
  });

  it('uses the planned schema', () => {
    expect(med.fields.map((f) => `${f.name}:${f.type}:${f.len}:${f.dec}`)).toEqual([
      'CODE:C:6:0',
      'NAME:C:20:0',
      'BATCH:C:8:0',
      'EXPIRY:D:8:0',
      'PRICE:N:8:2',
      'QTY:N:5:0',
    ]);
    expect(seed('BILLS').fields.map((f) => f.name)).toEqual([
      'BILL_NO',
      'BILL_DATE',
      'CUST_ID',
      'SUBTOTAL',
      'DISCOUNT',
      'GST',
      'TOTAL',
    ]);
  });

  it('every value fits its field', () => {
    for (const name of ['MEDICINE', 'CUSTOMER', 'BILLS', 'BILLITEM']) {
      const t = seed(name);
      for (const row of t.rows)
        for (const f of t.fields)
          expect(row[f.name]!.length, `${name}.${f.name}`).toBeLessThanOrEqual(f.len);
    }
  });

  it('has the cases the scenarios need', () => {
    const exp = med.rows.map((r) => r.EXPIRY!);
    expect(exp.filter((e) => e < '19980715').length).toBeGreaterThanOrEqual(2); // really expired
    expect(exp.filter((e) => e >= '20000101').length).toBeGreaterThanOrEqual(3); // Y2K bug victims
    expect(med.rows.find((r) => r.CODE === 'THY050')!.QTY).toBe('3'); // low stock for bug 2
  });

  it('the seed bills add up with the same rules', () => {
    for (const b of seed('BILLS').rows) {
      const p = (s: string) => Math.round(Number(s) * 100);
      const sub = p(b.SUBTOTAL!);
      const disc = sub > 500000 ? Math.trunc(sub / 10) : 0;
      const gst = Math.trunc(((sub - disc) * 17) / 100);
      expect([p(b.DISCOUNT!), p(b.GST!), p(b.TOTAL!)], b.BILL_NO).toEqual([
        disc,
        gst,
        sub - disc + gst,
      ]);
    }
  });
});

describe('every scenario ran to the end', () => {
  const expected = readdirSync(resolve(GRAVEYARD, 'shifa/scenarios'))
    .filter((f) => f.endsWith('.keys'))
    .map((f) => f.replace(/\.keys$/, ''))
    .sort();

  it('has a fixture for every scenario', () => {
    expect(scenarios('shifa')).toEqual(expected);
  });

  it.each(expected)('%s: the app exited from the menu with every key used', (s) => {
    expect(readText(fx(s, 'EXIT.TXT')).trim()).toBe('OK');
  });
});

describe('main menu', () => {
  const s = readScreen(fx('menu', 'MENU.SCR'));

  it('shows the title, the date and the five choices', () => {
    expect(s.text[0]).toContain('SHIFA MEDICAL STORE');
    expect(s.text[0]).toContain('v2.3');
    expect(s.text[0]).toContain('15/07/98');
    for (const item of ['1  New Bill', '2  Stock', '3  Customers', '4  Daily Report', '5  Exit'])
      expect(s.all).toContain(item);
  });

  it('uses 1990s blue and white colours', () => {
    expect(new Set(s.attr[0])).toEqual(new Set(['3F'])); // title bar: bright white on cyan
    expect(s.attr[2]![0]).toBe('1F'); // body: bright white on blue
    expect(new Set(s.attr[24])).toEqual(new Set(['30'])); // hint bar: black on cyan
  });
});

describe('rule: 17% GST truncated to the paisa', () => {
  it('bill-small: 87.50 gives GST 14.87, not the rounded 14.88', () => {
    expect(lastBill('bill-small')).toEqual({
      BILL_NO: '9807-0001',
      BILL_DATE: '19980715',
      CUST_ID: '',
      SUBTOTAL: '87.50',
      DISCOUNT: '0.00',
      GST: '14.87',
      TOTAL: '102.37',
    });
    expect(readScreen(fx('bill-small', 'TOTALS.SCR')).all).toMatch(/GST 17%\s+14\.87/);
  });

  it('bill-small: one item row per line, with the price at the time of sale', () => {
    expect(items('bill-small', '9807-0001')).toEqual([
      {
        BILL_NO: '9807-0001',
        LINE: '1',
        CODE: 'PAN500',
        QTY: '4',
        PRICE: '12.50',
        AMOUNT: '50.00',
      },
      {
        BILL_NO: '9807-0001',
        LINE: '2',
        CODE: 'BRU400',
        QTY: '2',
        PRICE: '18.75',
        AMOUNT: '37.50',
      },
    ]);
  });
});

describe('rule: stock is decremented per item', () => {
  it('bill-small: PAN500 240 -> 236, BRU400 180 -> 178, nothing else changes', () => {
    const before = Object.fromEntries(seed('MEDICINE').rows.map((r) => [r.CODE, r.QTY]));
    const after = byCode('bill-small');
    expect(after.PAN500!.QTY).toBe('236');
    expect(after.BRU400!.QTY).toBe('178');
    for (const [code, qty] of Object.entries(before))
      if (code !== 'PAN500' && code !== 'BRU400') expect(after[code]!.QTY, code).toBe(qty);
  });
});

describe('rule: 10% discount on bills over Rs 5,000', () => {
  it('bill-discount: 5200.00 gets 520.00 off, GST on the rest', () => {
    expect(lastBill('bill-discount')).toMatchObject({
      CUST_ID: 'C0002',
      SUBTOTAL: '5200.00',
      DISCOUNT: '520.00',
      GST: '795.60',
      TOTAL: '5475.60',
    });
    expect(byCode('bill-discount').INS100!.QTY).toBe('4');
  });

  it('bill-5000: exactly 5000.00 gets no discount', () => {
    expect(lastBill('bill-5000')).toMatchObject({
      SUBTOTAL: '5000.00',
      DISCOUNT: '0.00',
      GST: '850.00',
      TOTAL: '5850.00',
    });
  });
});

describe('rule: bill numbers are YYMM-####, restarting each month', () => {
  it('the first July 1998 bill is 9807-0001 even though June has three', () => {
    expect(lastBill('bill-small').BILL_NO).toBe('9807-0001');
    expect(readScreen(fx('bill-small', 'SAVED.SCR')).all).toContain('BILL 9807-0001 SAVED');
  });

  it('daily-report: the second bill of the day is 9807-0002', () => {
    const bills = readTable(fx('daily-report', 'BILLS.csv')).rows.map((r) => r.BILL_NO);
    expect(bills).toEqual(['9806-0001', '9806-0002', '9806-0003', '9807-0001', '9807-0002']);
  });
});

describe('rule: expired batches are blocked', () => {
  it('expired: SEP200 and AMP500 are refused and no bill is saved', () => {
    expect(readScreen(fx('expired', 'EXPIRED.SCR')).text[23]).toContain(
      'BATCH S97090 EXPIRED - CANNOT SELL',
    );
    expect(readScreen(fx('expired', 'EXPIRED2.SCR')).text[23]).toContain(
      'BATCH AC9812 EXPIRED - CANNOT SELL',
    );
    expect(readScreen(fx('expired', 'CANCEL.SCR')).text[23]).toContain('BILL CANCELLED');
    expect(readTable(fx('expired', 'BILLS.csv')).rows).toHaveLength(3);
    expect(readTable(fx('expired', 'MEDICINE.csv')).rows).toEqual(seed('MEDICINE').rows);
  });

  it('the error line is white on red', () => {
    const s = readScreen(fx('expired', 'EXPIRED.SCR'));
    const col = s.text[23]!.indexOf('BATCH');
    expect(s.attr[23]![col]).toBe('4F');
  });
});

describe('LEGACY BUG 1: two-digit year in the expiry check', () => {
  it('in 1998 it blocks ORS001, which is good until June 2000', () => {
    expect(readScreen(fx('y2k-blocks-2000', 'BLOCKED.SCR')).text[23]).toContain(
      'BATCH O98040 EXPIRED',
    );
  });

  it('in January 2000 it sells SEP200, which expired in June 1998', () => {
    const bill = lastBill('y2k-sells-expired');
    expect(bill).toMatchObject({
      BILL_NO: '0001-0001',
      BILL_DATE: '20000115',
      SUBTOTAL: '14.00',
      TOTAL: '16.38',
    });
    expect(items('y2k-sells-expired', '0001-0001').map((r) => r.CODE)).toEqual(['SEP200']);
    expect(byCode('y2k-sells-expired').SEP200!.QTY).toBe('89');
  });
});

describe('LEGACY BUG 2: qty 0 then edit allows negative stock', () => {
  it('a qty above stock is refused at entry', () => {
    expect(readScreen(fx('negative-stock', 'REFUSED.SCR')).text[23]).toContain('ONLY 3 IN STOCK');
  });

  it('qty 0 is accepted, F3 edits it to 5, and saving takes THY050 to -2', () => {
    expect(readScreen(fx('negative-stock', 'EDITED.SCR')).all).toMatch(/THY050.*\s5\s+300\.00/);
    expect(lastBill('negative-stock')).toMatchObject({
      SUBTOTAL: '300.00',
      GST: '51.00',
      TOTAL: '351.00',
    });
    expect(byCode('negative-stock').THY050!.QTY).toBe('-2');
  });
});

describe('stock screen', () => {
  const pages = ['STOCK1', 'STOCK2', 'STOCK3'].map((p) => readScreen(fx('stock', `${p}.SCR`)));

  it('pages through all 40 medicines, 17 per page, each exactly once', () => {
    const codes = seed('MEDICINE').rows.map((r) => r.CODE!);
    const shown = pages.flatMap((p) =>
      p.text
        .slice(4, 21)
        .map((l) => l.slice(1, 7))
        .filter((c) => c.trim()),
    );
    expect(shown).toEqual(codes);
    expect(pages[0]!.all).toContain('Page 1 of 3');
    expect(pages[2]!.all).toContain('Page 3 of 3');
  });

  it('PgDn on the last page stays there, and PgUp goes back', () => {
    expect(readScreen(fx('stock', 'STOCK2B.SCR')).text).toEqual(pages[1]!.text);
  });

  it('shows dates as DD/MM/YY, the way the app always did', () => {
    expect(pages[0]!.all).toMatch(/PAN500 PANADOL 500MG STRIP\s+B98031\s+31\/12\/99/);
  });
});

describe('customers screen', () => {
  it('lists the 8 customers', () => {
    const s = readScreen(fx('customers', 'CUSTS.SCR'));
    for (const c of seed('CUSTOMER').rows) expect(s.all).toContain(c.NAME);
  });

  it('refuses a blank name', () => {
    expect(readScreen(fx('customers', 'NONAME.SCR')).text[23]).toContain('NAME REQUIRED');
  });

  it('adds a customer with the next id', () => {
    expect(readTable(fx('customers', 'CUSTOMER.csv')).rows.at(-1)).toEqual({
      CUST_ID: 'C0009',
      NAME: 'ALI RAZA',
      PHONE: '051-4567890',
    });
    expect(readScreen(fx('customers', 'ADDED.SCR')).text[23]).toContain('CUSTOMER C0009 ADDED');
  });
});

describe('daily report', () => {
  it("counts today's bills, sales and GST", () => {
    const s = readScreen(fx('daily-report', 'REPORT.SCR'));
    expect(s.all).toContain('9807-0001');
    expect(s.all).toContain('9807-0002');
    expect(s.all).not.toContain('9806-0003');
    expect(s.all).toMatch(/BILLS:\s+2\s+SALES:\s+37\.55\s+GST:\s+5\.45/);
  });
});

describe('Esc always returns safely', () => {
  it('ends on the main menu, and Esc on the menu did not exit', () => {
    expect(readScreen(fx('escape', 'MENU.SCR')).all).toContain('1  New Bill');
    expect(readTable(fx('escape', 'BILLS.csv')).rows).toHaveLength(3);
  });
});
