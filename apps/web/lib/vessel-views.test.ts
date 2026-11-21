import type { DbfRecord } from '@afterlife/dbf';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { displayValue, money, searchRecords, vesselViews, wordKey } from './vessel-views';

describe('vesselViews', () => {
  it('the old main menu becomes the app’s navigation: a bill form, then two lists', () => {
    const views = vesselViews(SHIFA_REFERENCE_SOUL);
    expect(views.map((v) => [v.title, v.kind])).toEqual([
      ['NEW BILL', 'action'],
      ['STOCK', 'table'],
      ['CUSTOMERS', 'table'],
    ]);
    const stock = views[1]!;
    expect(stock.kind === 'table' && stock.entity.id).toBe('medicine');
    expect(stock.kind === 'table' && stock.fields).toEqual([
      'CODE',
      'NAME',
      'BATCH',
      'EXPIRY',
      'PRICE',
      'QTY',
    ]);
    expect(views[0]!.kind === 'action' && views[0]!.actionId).toBe('save-bill');
    // The customers list adds a customer, as the old screen's "A=Add" did.
    const customers = views[2]!;
    expect(customers.kind === 'table' && customers.addActionId).toBe('add-customer');
    expect(stock.kind === 'table' && stock.addActionId).toBeUndefined();
  });

  it('a Soul without a menu still gets each action and each list of records', () => {
    const soul = { ...SHIFA_REFERENCE_SOUL, screens: [] };
    expect(vesselViews(soul).map((v) => v.kind)).toEqual(['action', 'table', 'table', 'table']);
  });
});

describe('money', () => {
  it('groups thousands and keeps the paisa exact', () => {
    expect(money('5475.60')).toBe('5,475.60');
    expect(money('6843815.55')).toBe('6,843,815.55');
    expect(money('-1200.5')).toBe('-1,200.5');
    expect(money('12.50')).toBe('12.50');
    expect(money(null)).toBe('');
    expect(money('********')).toBe('********');
  });

  it('only adds commas: taking them out gives the number back (round trip)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        fc.nat({ max: 99 }),
        (n, p) => {
          const s = `${n}.${String(p).padStart(2, '0')}`;
          expect(money(s).replace(/,/g, '')).toBe(s);
        },
      ),
    );
  });
});

describe('searchRecords', () => {
  const rec = (CODE: string, NAME: string, deleted = false): DbfRecord => ({
    deleted,
    values: { CODE, NAME },
  });
  const all = [
    rec('PAN500', 'PANADOL 500MG STRIP'),
    rec('INS100', 'INSULIN MIXTARD 10ML'),
    rec('MUL200', 'MULTIVITAMIN SYRUP'),
    rec('OLD001', 'PANADOL OLD', true),
  ];

  it('a code first, then names that start with it, then names that contain it; never a deleted one', () => {
    expect(searchRecords(all, 'ins', ['CODE', 'NAME']).map((r) => r.values.CODE)).toEqual([
      'INS100',
    ]);
    expect(searchRecords(all, 'pan', ['CODE', 'NAME']).map((r) => r.values.CODE)).toEqual([
      'PAN500',
    ]);
    expect(searchRecords(all, 'syrup', ['CODE', 'NAME']).map((r) => r.values.CODE)).toEqual([
      'MUL200',
    ]);
    expect(searchRecords(all, '  ', ['CODE', 'NAME'])).toEqual([]);
  });

  it('every match holds the query, at most the limit (invariant)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 3 }), (q) => {
        const out = searchRecords(all, q, ['CODE', 'NAME'], 2);
        expect(out.length).toBeLessThanOrEqual(2);
        for (const r of out) {
          expect(r.deleted).toBe(false);
          expect(`${r.values.CODE} ${r.values.NAME}`.toLowerCase()).toContain(
            q.trim().toLowerCase(),
          );
        }
      }),
    );
  });
});

describe('displayValue and wordKey', () => {
  it('a date as the shop writes it, a number as money, text as it is', () => {
    expect(displayValue({ name: 'EXPIRY', type: 'D', length: 8, decimals: 0 }, '19991231')).toBe(
      '31/12/1999',
    );
    expect(displayValue({ name: 'PRICE', type: 'N', length: 8, decimals: 2 }, '1650.00')).toBe(
      '1,650.00',
    );
    expect(displayValue({ name: 'QTY', type: 'N', length: 5, decimals: 0 }, null)).toBe('');
    expect(displayValue({ name: 'NAME', type: 'C', length: 20, decimals: 0 }, 'PANADOL')).toBe(
      'PANADOL',
    );
  });

  it('a label’s key for the translations', () => {
    expect(wordKey('NEW BILL')).toBe('new_bill');
    expect(wordKey('CUST_ID')).toBe('cust_id');
  });
});
