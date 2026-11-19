import { describe, expect, it } from 'vitest';
import { tryRule } from './tryout';

describe('tryRule (the Playground rule tryout)', () => {
  it('evaluates an expression against JSON values and shows the answer', () => {
    expect(
      tryRule(
        'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
        '{"bill":{"subtotal":"6000.00"}}',
      ),
    ).toEqual({ ok: true, value: '600', kind: 'number' });
    expect(
      tryRule(
        'medicine.expiry >= today',
        '{"today":{"date":"1998-07-15"},"medicine":{"expiry":{"date":"1998-07-14"}}}',
      ),
    ).toEqual({
      ok: true,
      value: 'false',
      kind: 'true or false',
    });
    expect(tryRule('addDays(today, 1)', '{"today":{"date":"1999-12-31"}}')).toEqual({
      ok: true,
      value: '2000-01-01',
      kind: 'date',
    });
  });

  it('says what is wrong: the values, the syntax, or the evaluation', () => {
    expect(tryRule('1 +', '{}')).toMatchObject({
      ok: false,
      where: 'expression',
      message: expect.stringMatching(/column 4/),
    });
    expect(tryRule('x', '{nope')).toMatchObject({ ok: false, where: 'values' });
    expect(tryRule('x', '[1]')).toMatchObject({
      ok: false,
      where: 'values',
      message: 'The values must be a JSON object',
    });
    expect(tryRule('x', '{}')).toMatchObject({
      ok: false,
      where: 'evaluation',
      message: 'Nothing is called x',
    });
  });
});
