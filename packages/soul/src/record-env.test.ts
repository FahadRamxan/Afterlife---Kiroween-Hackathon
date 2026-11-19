// Review 41-50: rules run on real data. A DBF gives dates as "19991231" and codes as "12"; the
// field's own type says what they are, not how they look.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDbf } from '@afterlife/dbf';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DslDate, dslDate, dslText, evaluate, parseExpr } from './dsl';
import { SHIFA_REFERENCE_SOUL } from './examples/shifa';
import type { Entity } from './ir';
import { recordEnv } from './record-env';

const MEDICINE = SHIFA_REFERENCE_SOUL.entities.find((e) => e.id === 'medicine')!;
const rows = readDbf(
  readFileSync(resolve(__dirname, '../../../samples/graveyard/dist/shifa/MEDICINE.DBF')),
).records.map((r) => r.values);
const rule = (id: string) =>
  parseExpr(SHIFA_REFERENCE_SOUL.rules.find((r) => r.id === id)!.expression);
const TODAY = dslDate('1998-07-15');

describe('recordEnv', () => {
  it('gives each field by its rule name, typed by the DBF field type', () => {
    const pan = rows.find((r) => r.CODE === 'PAN500')!;
    const env = recordEnv(MEDICINE, pan);
    expect(Object.keys(env).sort()).toEqual(['batch', 'code', 'expiry', 'name', 'price', 'qty']);
    expect(env.expiry).toEqual(new DslDate('1999-12-31'));
    expect(env.code).toEqual(dslText('PAN500'));
    expect(String(env.qty)).toBe('240');
    // An N field with a leading zero is still a number (a code would be C).
    const q = recordEnv(MEDICINE, { QTY: '045' }).qty;
    expect(evaluate(parseExpr('medicine.qty + 1'), { medicine: { qty: q } }).toString()).toBe('46');
  });

  it("Shifa's expiry rule on its real data: expired, expiring today, and good batches", () => {
    const ok = (code: string, today = TODAY) =>
      evaluate(rule('expired-batch-blocked'), {
        medicine: recordEnv(
          MEDICINE,
          rows.find((r) => r.CODE === code)!,
        ),
        today,
      });
    // SEP200 expired on 30 June 1998; PAN500 is good until 31 December 1999.
    expect(ok('SEP200')).toBe(false);
    expect(ok('PAN500')).toBe(true);
    // A batch that expires today can still be sold.
    expect(ok('SEP200', dslDate('1998-06-30'))).toBe(true);
  });

  it('a C field that is all digits stays text: the code "12" is not the number 12', () => {
    const e: Entity = {
      ...MEDICINE,
      fields: [{ name: 'CODE', type: 'C', length: 6, decimals: 0 }],
    };
    const env = { medicine: recordEnv(e, { CODE: '12' }) };
    expect(evaluate(parseExpr("medicine.code = '12'"), env)).toBe(true);
    expect(() => evaluate(parseExpr('medicine.code + 1'), env)).toThrow();
  });

  it('a blank date or number is missing, and a rule that needs it says so', () => {
    const env = { medicine: recordEnv(MEDICINE, { CODE: 'X', EXPIRY: null, QTY: null }) };
    expect(env.medicine).not.toHaveProperty('expiry');
    expect(() => evaluate(rule('expired-batch-blocked'), { ...env, today: TODAY })).toThrow(
      /missing|expiry/i,
    );
  });

  it('every DBF date gives the same day, whatever the record (invariant)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('1900-01-01'), max: new Date('2099-12-31'), noInvalidDate: true }),
        (d) => {
          const ymd = d.toISOString().slice(0, 10);
          const env = recordEnv(MEDICINE, { EXPIRY: ymd.replaceAll('-', '') });
          expect(env.expiry).toEqual(new DslDate(ymd));
        },
      ),
    );
  });
});
