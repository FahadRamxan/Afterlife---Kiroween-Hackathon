import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { exprArbitrary } from './dsl-arbitrary';
import { DslError, dslDate, evaluate, parseExpr, printExpr, type Env } from './dsl';
import { SHIFA_REFERENCE_SOUL } from './examples/shifa';

const ev = (src: string, env: Env = {}) => evaluate(parseExpr(src), env);
const num = (src: string, env: Env = {}) => (ev(src, env) as Decimal).toString();

describe('parse and print', () => {
  it('round-trip: parse(print(ast)) is the same AST', () => {
    fc.assert(
      fc.property(exprArbitrary, (ast) => {
        expect(parseExpr(printExpr(ast))).toEqual(ast);
      }),
    );
  });

  it('precedence and associativity: what a 1998 programmer means', () => {
    expect(num('1 + 2 * 3')).toBe('7');
    expect(num('(1 + 2) * 3')).toBe('9');
    expect(num('10 - 3 - 2')).toBe('5');
    expect(num('-2 * 3')).toBe('-6');
    expect(ev('1 < 2 and 2 < 3 or false')).toBe(true);
    expect(ev('not 1 > 2')).toBe(true);
    expect(num('if 1 > 2 then 1 else if 2 > 1 then 2 else 3')).toBe('2');
  });

  it('every rule in the reference Soul of Shifa parses', () => {
    for (const r of SHIFA_REFERENCE_SOUL.rules)
      expect(() => parseExpr(r.expression), r.id).not.toThrow();
  });

  it('a syntax error says where', () => {
    expect(() => parseExpr('1 +')).toThrow(DslError);
    expect(() => parseExpr('1 +')).toThrow(/column 4/);
    expect(() => parseExpr('bill.')).toThrow(/a field name/);
    expect(() => parseExpr('x => 1')).toThrow(/only inside sum, count, any or all/);
    expect(() => parseExpr("'unterminated")).toThrow(/string/);
  });
});

describe('evaluate', () => {
  const bill = { subtotal: '6000.00', discount: '600.00' };

  it("runs Shifa's rules on decimal numbers", () => {
    expect(
      num('if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0', { bill }),
    ).toBe('600');
    expect(
      num('if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0', {
        bill: { subtotal: '5000' },
      }),
    ).toBe('0');
    expect(num('trunc((bill.subtotal - bill.discount) * 0.17, 2)', { bill })).toBe('918');
    // 17% of 102.37 is 17.4029: truncated, not rounded.
    expect(num('trunc(102.37 * 0.17, 2)')).toBe('17.4');
    expect(num('round(102.37 * 0.17, 2)')).toBe('17.4');
    expect(num('round(2.345, 2)')).toBe('2.35');
    expect(num('trunc(-2.349, 2)')).toBe('-2.34');
    expect(num('floor(-2.341, 2)')).toBe('-2.35');
    expect(num('ceil(2.341, 2)')).toBe('2.35');
    expect(num('min(3, 1, 2) + max(3, 1, 2)')).toBe('4');
  });

  it('aggregates over lists, with a lambda', () => {
    const items = [
      { qty: 2, price: '12.50' },
      { qty: '3', price: '0.10' },
    ];
    expect(num('sum(items, x => x.qty * x.price)', { items })).toBe('25.3');
    expect(num('count(items, x => x.qty > 2)', { items })).toBe('1');
    expect(ev('any(items, x => x.price < 1)', { items })).toBe(true);
    expect(ev('all(items, x => x.price < 1)', { items })).toBe(false);
  });

  it('dates: year, month and day of a date, as numbers (Prompt 68)', () => {
    const env = { today: dslDate('1998-07-15'), medicine: { expiry: dslDate('20000630') } };
    expect(num('year(today)', env)).toBe('1998');
    expect(num('month(today)', env)).toBe('7');
    expect(num('day(medicine.expiry)', env)).toBe('30');
    expect(num('year(medicine.expiry) % 100', env)).toBe('0');
    // Shifa's 1998 expiry check, as the old app does it: two-digit years (its Y2K bug).
    const yymmdd = (d: string) => `(year(${d}) % 100) * 10000 + month(${d}) * 100 + day(${d})`;
    expect(ev(`${yymmdd('medicine.expiry')} >= ${yymmdd('today')}`, env)).toBe(false);
    expect(() => ev('year(1998)', env)).toThrow(DslError);
    expect(() => ev('month(today, 1)', env)).toThrow(DslError);
  });

  it('dates: comparisons, addDays, daysBetween and weeksBetween', () => {
    const env = { today: dslDate('1998-07-15'), medicine: { expiry: dslDate('1998-07-15') } };
    expect(ev('medicine.expiry >= today', env)).toBe(true);
    expect(ev('addDays(today, 1) > medicine.expiry', env)).toBe(true);
    expect(num('daysBetween(today, addDays(today, 30))', env)).toBe('30');
    expect(num('weeksBetween(today, addDays(today, 20))', env)).toBe('2');
    // Over the end of February in a leap year.
    expect((ev('addDays(d, 1)', { d: dslDate('2000-02-28') }) as { iso: string }).iso).toBe(
      '2000-02-29',
    );
  });

  it('strings join with +, and compare', () => {
    expect(ev("'C' + '0009'")).toBe('C0009');
    expect(ev("customer.name != ''", { customer: { name: 'ASLAM' } })).toBe(true);
  });

  it('digits with a leading zero stay text: codes and phone numbers are not numbers', () => {
    const phone = { c: { phone: '03001234567' } };
    expect(ev("c.phone = '03001234567'", phone)).toBe(true);
    expect(ev("c.phone + '-1'", phone)).toBe('03001234567-1');
    expect(ev("m.code = '0012'", { m: { code: '0012' } })).toBe(true);
    // "0012" is not the code "12": never equal, and never quietly compared as numbers.
    expect(() => ev('a.code = b.code', { a: { code: '0012' }, b: { code: '12' } })).toThrow(
      DslError,
    );
    // Numbers written as text still are numbers, zero and fractions under 1 included.
    expect(num('x * 2', { x: '0.10' })).toBe('0.2');
    expect(num('x + 1', { x: '0' })).toBe('1');
    expect(num('x - 1', { x: '-0.5' })).toBe('-1.5');
  });

  it('addDays past the year 9999 is a rule error, not a crash', () => {
    const d = { d: dslDate('1998-07-15') };
    expect(() => ev('addDays(d, 1000000000)', d)).toThrow(DslError);
    expect(() => ev('addDays(d, 3000000)', d)).toThrow(DslError);
    expect(() => ev('addDays(d, -800000)', d)).toThrow(DslError);
    expect((ev('addDays(d, 2900000)', d) as { iso: string }).iso).toMatch(/^9\d{3}-/);
  });

  it('money never goes through a float: ten 0.1s are exactly 1', () => {
    const items = Array.from({ length: 10 }, () => ({ price: 0.1 }));
    expect(num('sum(items, x => x.price)', { items })).toBe('1');
    expect(num('0.1 + 0.2')).toBe('0.3');
  });

  it('property: evaluation is deterministic and agrees with decimal.js on sums and products', () => {
    const amount = fc
      .integer({ min: -10_000_000, max: 10_000_000 })
      .map((p) => new Decimal(p).div(100).toFixed(2));
    fc.assert(
      fc.property(amount, amount, amount, (a, b, c) => {
        const env = { a, b, c };
        const src = 'trunc((a + b) * c * 0.17, 2)';
        const r1 = num(src, env);
        expect(num(src, env)).toBe(r1);
        expect(r1).toBe(
          new Decimal(a)
            .plus(b)
            .times(c)
            .times('0.17')
            .toDecimalPlaces(2, Decimal.ROUND_DOWN)
            .toString(),
        );
      }),
    );
  });

  it('property: every generated expression evaluates the same way twice (or fails the same way)', () => {
    const env = {
      bill: { subtotal: '6000', discount: '1' },
      item: { qty: 2 },
      today: dslDate('1998-07-15'),
    };
    fc.assert(
      fc.property(exprArbitrary, (ast) => {
        const run = () => {
          try {
            return JSON.stringify(evaluate(ast, env));
          } catch (e) {
            return `error: ${(e as Error).message}`;
          }
        };
        expect(run()).toBe(run());
      }),
    );
  });
});

describe('safety', () => {
  it('reads only what it was given: no prototype, no globals', () => {
    for (const src of ['bill.constructor', 'bill.__proto__', 'x.toString', 'process', 'globalThis'])
      expect(() => ev(src, { bill: {}, x: {} }), src).toThrow(DslError);
  });

  it('refuses unknown functions and wrong types, saying which', () => {
    expect(() => ev('eval(1)')).toThrow(/No function eval/);
    expect(() => ev("1 + 'a'")).toThrow(/number/);
    expect(() => ev('1 / 0')).toThrow(/Division by zero/);
    expect(() => ev('if 1 then 2 else 3')).toThrow(/true or false/);
  });

  it('a long or deep expression is refused rather than hanging', () => {
    expect(() => parseExpr('1' + ' + 1'.repeat(5000))).toThrow(/too long/);
    expect(() => parseExpr('('.repeat(200) + '1' + ')'.repeat(200))).toThrow(/too deep/);
    const items = Array.from({ length: 2000 }, () => ({ q: 1 }));
    expect(() => ev('sum(items, x => sum(items, y => y.q))', { items })).toThrow(/too much work/);
  });
});
