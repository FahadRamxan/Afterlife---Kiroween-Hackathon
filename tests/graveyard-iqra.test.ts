// Prompt 13: Iqra School Fees 1.1 (2001). Checks the seed data and the scripted DOSBox runs in
// samples/graveyard/fixtures/iqra. Expected numbers are worked out by hand, and the seed receipts
// are cross-checked against an independent TypeScript version of the fee rules.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GRAVEYARD, readScreen, readTable, readText, scenarios } from './helpers/graveyard';

const fx = (scenario: string, file: string) => `fixtures/iqra/${scenario}/${file}`;
const seed = (name: string) => readTable(`iqra/seed/${name}.csv`);
const payments = (scenario: string) => readTable(fx(scenario, 'PAYMENT.csv')).rows;
const newPayments = (scenario: string) => payments(scenario).slice(6);

// --- Independent reference implementation (TypeScript, integer paisa) ---
const dayNumber = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 86_400_000;
/** Monday-based calendar week index: what the 2001 app counts (the legacy bug). */
const weekIndex = (day: number) => Math.floor((day + 3) / 7);
function lateWeeksCalendar(pay: [number, number, number], feeYear: number, feeMonth: number) {
  const due = dayNumber(feeYear, feeMonth, 10);
  const paid = dayNumber(...pay);
  return paid <= due ? 0 : weekIndex(paid) - weekIndex(due);
}
const lateWeeksIntended = (daysLate: number) => (daysLate <= 0 ? 0 : Math.ceil(daysLate / 7));
const lateFee = (weeks: number) => Math.min(weeks * 5000, 50000);
const siblingDiscount = (fee: number, sib: number) => (sib >= 2 ? Math.trunc((fee * 15) / 100) : 0);
/** Exact: every money field has 2 decimals, so dropping the point gives paisa. No floats. */
const paisa = (s: string) => {
  expect(s).toMatch(/^-?\d+\.\d{2}$/);
  return Number(s.replace('.', ''));
};

describe('reference rules (sanity)', () => {
  it('agree with the hand-worked cases', () => {
    expect(lateWeeksCalendar([2001, 3, 11], 2001, 3)).toBe(0);
    expect(lateWeeksCalendar([2001, 3, 18], 2001, 3)).toBe(1);
    expect(lateWeeksCalendar([2001, 6, 1], 2001, 3)).toBe(12);
    expect(lateWeeksIntended(8)).toBe(2);
  });

  it('property: the calendar-week count is never more than the intended count, and differs by at most 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 0, max: 11 }),
        (daysLate, monthOffset) => {
          const feeMonth = 1 + monthOffset;
          const due = dayNumber(2001, feeMonth, 10);
          const pay = new Date((due + daysLate) * 86_400_000);
          const cal = lateWeeksCalendar(
            [pay.getUTCFullYear(), pay.getUTCMonth() + 1, pay.getUTCDate()],
            2001,
            feeMonth,
          );
          const intended = lateWeeksIntended(daysLate);
          expect(cal).toBeLessThanOrEqual(intended);
          expect(intended - cal).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe('seed data', () => {
  const students = seed('STUDENT');

  it('has 60 students with unique ids, in 48 families', () => {
    expect(students.rows).toHaveLength(60);
    expect(new Set(students.rows.map((r) => r.STU_ID)).size).toBe(60);
    expect(new Set(students.rows.map((r) => r.FAMILY)).size).toBe(48);
  });

  it('numbers the children of each family 1, 2, 3... with no gaps', () => {
    const fam = new Map<string, number[]>();
    for (const r of students.rows)
      fam.set(r.FAMILY!, [...(fam.get(r.FAMILY!) ?? []), Number(r.SIB)]);
    for (const [f, sibs] of fam) expect(sibs.sort(), f).toEqual(sibs.map((_, i) => i + 1));
    expect([...fam.values()].filter((s) => s.length === 2)).toHaveLength(10);
    expect([...fam.values()].filter((s) => s.length === 3)).toHaveLength(1);
  });

  it('every class has a fee, and every student is in a class 1 to 10', () => {
    expect(seed('FEES').rows.map((r) => r.CLASS)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    for (const r of students.rows) expect(Number(r.CLASS)).toBeGreaterThanOrEqual(1);
    for (const r of students.rows) expect(Number(r.CLASS)).toBeLessThanOrEqual(10);
  });

  it('every value fits its field', () => {
    for (const name of ['STUDENT', 'FEES', 'PAYMENT']) {
      const t = seed(name);
      for (const row of t.rows)
        for (const f of t.fields)
          expect(row[f.name]!.length, `${name}.${f.name}`).toBeLessThanOrEqual(f.len);
    }
  });

  it('the seed receipts follow the rules (checked with the reference implementation)', () => {
    const fees = Object.fromEntries(seed('FEES').rows.map((r) => [r.CLASS, paisa(r.MONTHLY!)]));
    const byId = Object.fromEntries(students.rows.map((r) => [r.STU_ID, r]));
    for (const p of seed('PAYMENT').rows) {
      const s = byId[p.STU_ID!]!;
      const fee = fees[s.CLASS!]!;
      const d = p.PAY_DATE!;
      const weeks = lateWeeksCalendar(
        [+d.slice(0, 4), +d.slice(4, 6), +d.slice(6)],
        +p.FEE_MONTH!.slice(0, 4),
        +p.FEE_MONTH!.slice(4),
      );
      const disc = siblingDiscount(fee, Number(s.SIB));
      expect(
        [paisa(p.FEE!), paisa(p.DISCOUNT!), paisa(p.LATE_FEE!), paisa(p.TOTAL!)],
        `receipt ${p.RECEIPT}`,
      ).toEqual([fee, disc, lateFee(weeks), fee - disc + lateFee(weeks)]);
    }
  });
});

describe('every scenario ran to the end', () => {
  const expected = readdirSync(resolve(GRAVEYARD, 'iqra/scenarios'))
    .filter((f) => f.endsWith('.keys'))
    .map((f) => f.replace(/\.keys$/, ''))
    .sort();

  it('has a fixture for every scenario', () => {
    expect(scenarios('iqra')).toEqual(expected);
  });

  it.each(expected)('%s: the app exited from the menu with every key used', (s) => {
    expect(readText(fx(s, 'EXIT.TXT')).trim()).toBe('OK');
  });
});

describe('highlight-bar menu (keyboard navigation)', () => {
  const items = ['Collect Fee', 'Students', 'Fee Schedule', "Today's Receipts", 'Exit'];
  const highlighted = (scr: string) => {
    const s = readScreen(fx('menu', scr));
    return items.filter((item) => {
      const row = s.text.findIndex((l) => l.includes(item));
      return s.attr[row]![s.text[row]!.indexOf(item)] === '70';
    });
  };

  it('shows the title with a four-digit year, the school and every item', () => {
    const s = readScreen(fx('menu', 'MENU.SCR'));
    expect(s.text[0]).toContain('IQRA SCHOOL FEES 1.1');
    expect(s.text[0]).toContain('12-03-2001');
    expect(s.all).toContain('IQRA MODEL SCHOOL');
    for (const item of items) expect(s.all).toContain(item);
  });

  it('starts on the first item, Down moves, Up from the top wraps to Exit', () => {
    expect(highlighted('MENU.SCR')).toEqual(['Collect Fee']);
    expect(highlighted('MENU2.SCR')).toEqual(['Students']);
    expect(highlighted('WRAP.SCR')).toEqual(['Exit']);
  });
});

describe('rule: monthly fee by class, receipts numbered in order', () => {
  it('pay-ontime: class 7, paid before the 10th, receipt 000007', () => {
    expect(newPayments('pay-ontime')).toEqual([
      {
        RECEIPT: '7',
        PAY_DATE: '20010308',
        STU_ID: 'S0025',
        FEE_MONTH: '200103',
        FEE: '2000.00',
        DISCOUNT: '0.00',
        LATE_FEE: '0.00',
        TOTAL: '2000.00',
      },
    ]);
    expect(readScreen(fx('pay-ontime', 'CALC.SCR')).all).toMatch(/TOTAL\s+2000\.00/);
    expect(readScreen(fx('pay-ontime', 'SAVED.SCR')).text[23]).toContain('RECEIPT 000007 SAVED');
  });

  it('the fee month defaults to the current month', () => {
    expect(readScreen(fx('pay-ontime', 'CALC.SCR')).all).toContain('032001');
  });
});

describe('rule: Rs 50 per week late after the 10th, capped at Rs 500', () => {
  it('late-monday: 2 days late, next calendar week, Rs 50 (F2 calculates and saves)', () => {
    expect(newPayments('late-monday')[0]).toMatchObject({
      STU_ID: 'S0027',
      LATE_FEE: '50.00',
      TOTAL: '1650.00',
    });
    expect(readScreen(fx('late-monday', 'SAVED.SCR')).text[23]).toContain('RECEIPT 000007 SAVED');
  });

  it('late-cap: paying March on 1 June, 12 weeks, capped at Rs 500', () => {
    expect(newPayments('late-cap')[0]).toMatchObject({
      PAY_DATE: '20010601',
      FEE_MONTH: '200103',
      FEE: '1400.00',
      LATE_FEE: '500.00',
      TOTAL: '1900.00',
    });
    expect(readScreen(fx('late-cap', 'CALC.SCR')).all).toMatch(/LATE FEE \(12 WK\)\s+500\.00/);
  });
});

describe('LEGACY BUG: late fee counts calendar weeks, not days', () => {
  it('late-sunday: 1 day late but no late fee', () => {
    expect(newPayments('late-sunday')[0]).toMatchObject({
      PAY_DATE: '20010311',
      LATE_FEE: '0.00',
      TOTAL: '1800.00',
    });
  });

  it('late-8days: 8 days late but charged 1 week, not 2', () => {
    expect(newPayments('late-8days')[0]).toMatchObject({
      PAY_DATE: '20010318',
      LATE_FEE: '50.00',
      TOTAL: '1550.00',
    });
    expect(lateWeeksIntended(8)).toBe(2);
  });
});

describe('rule: 15% sibling discount for the second and later children', () => {
  it('second and third children get 15% off, receipts 000007 and 000008', () => {
    expect(newPayments('sibling')).toEqual([
      expect.objectContaining({
        RECEIPT: '7',
        STU_ID: 'S0022',
        FEE: '2000.00',
        DISCOUNT: '300.00',
        TOTAL: '1700.00',
      }),
      expect.objectContaining({
        RECEIPT: '8',
        STU_ID: 'S0023',
        FEE: '1600.00',
        DISCOUNT: '240.00',
        TOTAL: '1360.00',
      }),
    ]);
    expect(readScreen(fx('sibling', 'SECOND.SCR')).all).toMatch(/SIBLING DISCOUNT 15%\s+300\.00/);
  });

  it('the eldest child gets no discount', () => {
    expect(newPayments('pay-ontime')[0]!.DISCOUNT).toBe('0.00');
  });
});

describe('validation', () => {
  it('a month already paid is refused, naming the receipt', () => {
    expect(readScreen(fx('duplicate', 'DUP.SCR')).text[23]).toContain(
      'FEE FOR 02/2001 ALREADY PAID (RECEIPT 000001)',
    );
    expect(payments('duplicate')).toHaveLength(6);
  });

  it('unknown student and invalid month are refused, and Up returns to the student field', () => {
    expect(readScreen(fx('errors', 'NOTFOUND.SCR')).text[23]).toContain('STUDENT NOT FOUND');
    expect(readScreen(fx('errors', 'BADMONTH.SCR')).text[23]).toContain('INVALID MONTH');
    const back = readScreen(fx('errors', 'BACKUP.SCR'));
    expect(back.all).toContain('HAMZA');
    expect(payments('errors')).toHaveLength(6);
  });
});

describe("today's receipts", () => {
  it('lists the two fees taken today with the total', () => {
    const s = readScreen(fx('receipts-today', 'TODAY.SCR'));
    expect(s.all).toMatch(/000007\s+S0005\s+HAMZA/);
    expect(s.all).toMatch(/000008\s+S0006\s+ZAINAB/);
    expect(s.all).not.toContain('000006');
    expect(s.all).toMatch(/RECEIPTS:\s+2\s+COLLECTED:\s+4200\.00/);
  });
});

describe('students and fee schedule', () => {
  it('pages through all 60 students, 17 per page', () => {
    const pages = ['STU1', 'STU2', 'STU3', 'STU4'].map((p) =>
      readScreen(fx('students', `${p}.SCR`)),
    );
    const ids = pages.flatMap((p) => p.text.map((l) => /^ (S\d{4}) /.exec(l)?.[1]).filter(Boolean));
    expect(ids).toEqual(seed('STUDENT').rows.map((r) => r.STU_ID));
    expect(pages[3]!.all).toContain('PAGE 4 OF 4');
    expect(readScreen(fx('students', 'STU3B.SCR')).text).toEqual(pages[2]!.text);
  });

  it('shows the fee for every class', () => {
    const s = readScreen(fx('schedule', 'SCHEDULE.SCR'));
    for (const f of seed('FEES').rows)
      expect(s.all).toMatch(
        new RegExp(`CLASS ${f.CLASS!.padStart(2)}\\s+${f.MONTHLY!.replace('.', '\\.')}`),
      );
  });

  it('Esc always returns to the menu, and Esc on the menu does not exit', () => {
    expect(readScreen(fx('escape', 'MENU.SCR')).all).toContain('Collect Fee');
    expect(payments('escape')).toHaveLength(6);
  });
});
