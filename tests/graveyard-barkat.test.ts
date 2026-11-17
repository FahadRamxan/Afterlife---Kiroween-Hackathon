// Prompt 14: Barkat Kiryana Ledger (1996). Checks the seed data and the scripted DOSBox runs in
// samples/graveyard/fixtures/barkat. Expected numbers are worked out by hand.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRAVEYARD, readScreen, readTable, readText, scenarios } from './helpers/graveyard';

const fx = (scenario: string, file: string) => `fixtures/barkat/${scenario}/${file}`;
const seed = (name: string) => readTable(`barkat/seed/${name}.csv`);
const party = (scenario: string, id: string) =>
  readTable(fx(scenario, 'PARTY.csv')).rows.find((r) => r.PARTY_ID === id)!;
const ledger = (scenario: string) => readTable(fx(scenario, 'LEDGER.csv')).rows;
/** Exact paisa from "1234.50". */
const paisa = (s: string) => {
  expect(s).toMatch(/^-?\d+\.\d{2}$/);
  return Number(s.replace('.', ''));
};
const rupees = (p: number) => `${Math.trunc(p / 100)}.${String(p % 100).padStart(2, '0')}`;

describe('seed data', () => {
  const parties = seed('PARTY');
  const entries = seed('LEDGER');

  it('has 25 parties with unique ids and romanised Urdu names', () => {
    expect(parties.rows).toHaveLength(25);
    expect(new Set(parties.rows.map((r) => r.PARTY_ID)).size).toBe(25);
    for (const r of parties.rows) expect(r.NAME).toMatch(/^[A-Z0-9 ()]+$/); // romanised, upper case ASCII
    expect(parties.rows.map((r) => r.NAME)).toContain('PHUPHO NASREEN');
  });

  it('uses N(8,2) for BALANCE, the field that overflows', () => {
    expect(parties.fields.find((f) => f.name === 'BALANCE')).toEqual({
      name: 'BALANCE',
      type: 'N',
      len: 8,
      dec: 2,
    });
    expect(parties.fields.find((f) => f.name === 'LIMIT')).toEqual({
      name: 'LIMIT',
      type: 'N',
      len: 9,
      dec: 2,
    });
  });

  it('replaying the ledger gives every running balance and every party balance', () => {
    const bal = new Map<string, number>();
    const lastPay = new Map<string, string>();
    entries.rows.forEach((e, i) => {
      expect(Number(e.ENTRY), 'entries are numbered in order').toBe(i + 1);
      const before = bal.get(e.PARTY_ID!) ?? 0;
      const after = e.KIND === 'S' ? before + paisa(e.AMOUNT!) : before - paisa(e.AMOUNT!);
      expect(after, `entry ${e.ENTRY}`).toBeGreaterThanOrEqual(0);
      expect(paisa(e.BALANCE!), `entry ${e.ENTRY}`).toBe(after);
      bal.set(e.PARTY_ID!, after);
      if (e.KIND === 'P') lastPay.set(e.PARTY_ID!, e.TX_DATE!);
    });
    for (const p of parties.rows) {
      expect(paisa(p.BALANCE!), p.PARTY_ID).toBe(bal.get(p.PARTY_ID!) ?? 0);
      expect(paisa(p.BALANCE!), `${p.PARTY_ID} within limit`).toBeLessThanOrEqual(paisa(p.LIMIT!));
      expect(p.LAST_PAY, p.PARTY_ID).toBe(lastPay.get(p.PARTY_ID!) ?? '');
    }
  });

  it('has the parties the scenarios need', () => {
    expect(seed('PARTY').rows.find((r) => r.PARTY_ID === 'P001')).toMatchObject({
      LIMIT: '150000.00',
      BALANCE: '98500.00',
    });
    expect(seed('PARTY').rows.find((r) => r.PARTY_ID === 'P005')).toMatchObject({
      LIMIT: '10000.00',
      BALANCE: '9800.00',
    });
    expect(seed('PARTY').rows.find((r) => r.PARTY_ID === 'P010')).toMatchObject({
      BALANCE: '0.00',
    });
    expect(entries.rows).toHaveLength(80);
  });
});

describe('every scenario ran to the end', () => {
  const expected = readdirSync(resolve(GRAVEYARD, 'barkat/scenarios'))
    .filter((f) => f.endsWith('.keys'))
    .map((f) => f.replace(/\.keys$/, ''))
    .sort();

  it('has a fixture for every scenario', () => {
    expect(scenarios('barkat')).toEqual(expected);
  });

  it.each(expected)('%s: the app exited from the menu with every key used', (s) => {
    expect(readText(fx(s, 'EXIT.TXT')).trim()).toBe('OK');
  });
});

describe('menu', () => {
  it('shows the letter hotkeys and a two-digit-year date', () => {
    const s = readScreen(fx('menu', 'MENU.SCR'));
    expect(s.text[0]).toContain('BARKAT KIRYANA LEDGER');
    expect(s.text[0]).toContain('20/11/96');
    for (const item of [
      'S  Sale on credit (udhaar)',
      'P  Payment received',
      'L  Ledger of a party',
      'B  Balances of all parties',
      'R  Reminders (no interest)',
      'X  Exit',
    ])
      expect(s.all).toContain(item);
  });
});

describe('rule: running balance per party', () => {
  it('sale-ok: a credit sale adds to the balance and to the ledger', () => {
    expect(party('sale-ok', 'P003').BALANCE).toBe('5790.00');
    expect(ledger('sale-ok').at(-1)).toEqual({
      ENTRY: '81',
      TX_DATE: '19961120',
      PARTY_ID: 'P003',
      KIND: 'S',
      AMOUNT: '450.00',
      BALANCE: '5790.00',
      NOTE: 'ATTA 20 KG',
    });
    expect(readScreen(fx('sale-ok', 'CONFIRM.SCR')).text[23]).toContain(
      'SAVE SALE OF RS 450.00 FOR P003? (Y/N)',
    );
    expect(readScreen(fx('sale-ok', 'SAVED.SCR')).text[23]).toContain(
      'SAVED. NEW BALANCE RS 5790.00',
    );
  });

  it('payment-ok: a payment lowers the balance and sets the last payment date', () => {
    expect(party('payment-ok', 'P003')).toMatchObject({ BALANCE: '3340.00', LAST_PAY: '19961120' });
    expect(ledger('payment-ok').at(-1)).toMatchObject({
      ENTRY: '81',
      KIND: 'P',
      AMOUNT: '2000.00',
      BALANCE: '3340.00',
    });
  });

  it('ledger: shows every entry of a party with its running balance', () => {
    const s = readScreen(fx('ledger', 'LEDGER.SCR'));
    expect(s.all).toContain('BAJI SHAMIM');
    expect(s.all).toContain('BALANCE RS 5340.00');
    const shown = s.text.filter((l) => /^ \d\d\/\d\d\/96 /.test(l));
    expect(shown.map((l) => l.trim().split(/\s+/).slice(0, 4).join(' '))).toEqual([
      '01/10/96 SALE 3200.00 3200.00',
      '08/10/96 SALE 850.00 4050.00',
      '22/10/96 PAID 2000.00 2050.00',
      '03/11/96 SALE 1290.00 3340.00',
      '14/11/96 SALE 2000.00 5340.00',
    ]);
  });
});

describe('rule: the credit limit blocks a sale', () => {
  it('sale-limit: 9800 + 450 is over 10000 and refused; 9800 + 200 is exactly the limit and allowed', () => {
    expect(readScreen(fx('sale-limit', 'LIMIT.SCR')).text[23]).toContain(
      'OVER LIMIT RS 10000.00 - BALANCE WOULD BE RS 10250.00',
    );
    expect(party('sale-limit', 'P005').BALANCE).toBe('10000.00');
    expect(ledger('sale-limit')).toHaveLength(81);
    expect(ledger('sale-limit').at(-1)).toMatchObject({
      PARTY_ID: 'P005',
      AMOUNT: '200.00',
      BALANCE: '10000.00',
      NOTE: 'CHEENI 1 KG',
    });
  });

  it('payment-too-much: a payment above the balance is refused', () => {
    expect(readScreen(fx('payment-too-much', 'TOOMUCH.SCR')).text[23]).toContain(
      'PAYMENT MORE THAN BALANCE RS 500.00',
    );
    expect(ledger('payment-too-much')).toHaveLength(80);
  });
});

describe('rule: monthly interest-free reminder list', () => {
  const remindersOf = (scenario: string) =>
    ['REM1', 'REM2'].flatMap((p) =>
      readScreen(fx(scenario, `${p}.SCR`))
        .text.map((l) => /^ (P\d{3}) /.exec(l)?.[1])
        .filter(Boolean),
    );

  it('lists every party that owes money and has not paid since 1 November', () => {
    const expected = seed('PARTY')
      .rows.filter((p) => paisa(p.BALANCE!) > 0 && (p.LAST_PAY ?? '') < '19961101')
      .map((p) => p.PARTY_ID);
    expect(expected).toHaveLength(23);
    expect(remindersOf('reminders')).toEqual(expected);
    const due = seed('PARTY')
      .rows.filter((p) => expected.includes(p.PARTY_ID))
      .reduce((s, p) => s + paisa(p.BALANCE!), 0);
    const rem1 = readScreen(fx('reminders', 'REM1.SCR'));
    expect(rem1.all).toContain('NOVEMBER 1996');
    expect(rem1.all).toContain('NO INTEREST');
    expect(readScreen(fx('reminders', 'REM2.SCR')).all).toContain(
      `PARTIES: 23   DUE: RS ${rupees(due)}`,
    );
  });

  it('a party that pays this month drops off the list', () => {
    expect(remindersOf('payment-ok')).not.toContain('P003');
    expect(remindersOf('payment-ok')).toHaveLength(22);
  });
});

describe('LEGACY BUG: balance overflows past Rs 99,999.99 (N(8,2))', () => {
  it('the 2000.00 sale is saved with BALANCE ********', () => {
    expect(readScreen(fx('overflow', 'SAVED.SCR')).text[23]).toContain(
      'SAVED. NEW BALANCE RS ********',
    );
    expect(ledger('overflow')[80]).toMatchObject({
      ENTRY: '81',
      PARTY_ID: 'P001',
      AMOUNT: '2000.00',
      BALANCE: '********',
    });
    expect(readScreen(fx('overflow', 'BAL1.SCR')).all).toMatch(
      /P001 HAJI BASHIR WHOLESALE .*\*{8}/,
    );
  });

  it('******** reads back as 0, so the next 500.00 sale leaves 500.00', () => {
    expect(readScreen(fx('overflow', 'PARTY2.SCR')).all).toContain('********');
    expect(ledger('overflow')[81]).toMatchObject({
      ENTRY: '82',
      AMOUNT: '500.00',
      BALANCE: '500.00',
    });
    expect(party('overflow', 'P001').BALANCE).toBe('500.00');
    expect(readScreen(fx('overflow', 'SAVED2.SCR')).text[23]).toContain(
      'SAVED. NEW BALANCE RS 500.00',
    );
  });

  it('the ledger screen shows the stars', () => {
    expect(readScreen(fx('overflow', 'LEDGER.SCR')).all).toMatch(/SALE\s+2000\.00\s+\*{8}/);
  });
});

describe('validation and navigation', () => {
  it('confirm-no: N saves nothing', () => {
    expect(readScreen(fx('confirm-no', 'NOTSAVED.SCR')).text[23]).toContain('NOT SAVED');
    expect(ledger('confirm-no')).toHaveLength(80);
    expect(party('confirm-no', 'P003').BALANCE).toBe('5340.00');
  });

  it('errors: unknown party and a bad amount are refused', () => {
    expect(readScreen(fx('errors', 'NOTFOUND.SCR')).text[23]).toContain('PARTY NOT FOUND');
    expect(readScreen(fx('errors', 'BADAMT.SCR')).text[23]).toContain('INVALID AMOUNT');
    expect(ledger('errors')).toHaveLength(80);
  });

  it('balances: all 25 parties over 2 pages, with the total owed', () => {
    const pages = ['BAL1', 'BAL2'].map((p) => readScreen(fx('balances', `${p}.SCR`)));
    const ids = pages.flatMap((p) => p.text.map((l) => /^ (P\d{3}) /.exec(l)?.[1]).filter(Boolean));
    expect(ids).toEqual(seed('PARTY').rows.map((r) => r.PARTY_ID));
    const total = seed('PARTY').rows.reduce((s, p) => s + paisa(p.BALANCE!), 0);
    expect(pages[1]!.all).toContain(`TOTAL OWED: RS ${rupees(total)}`);
    expect(readScreen(fx('balances', 'BAL1B.SCR')).text).toEqual(pages[0]!.text);
  });

  it('Esc always returns to the menu, and Esc on the menu does not exit', () => {
    expect(readScreen(fx('escape', 'MENU.SCR')).all).toContain('X  Exit');
    expect(ledger('escape')).toHaveLength(80);
  });
});
