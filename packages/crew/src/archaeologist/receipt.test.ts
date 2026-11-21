// @spec vessel-receipts#2 The layout from the old app's screen.
// @spec vessel-receipts#2.1 The receipt layout from the screen the old app saved on.
import type { ScreenModel } from '@afterlife/screen';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { describe, expect, it } from 'vitest';
import { shapeOf } from './actions';
import { inferReceipt } from './receipt';
import {
  graveyardEntities,
  graveyardRun,
  graveyardScreen,
  graveyardTables,
  readCsv,
} from './testing/graveyard-runs';

const ENTITIES = SHIFA_REFERENCE_SOUL.entities;
const KEYS = { BILLS: 'BILL_NO', BILLITEM: null, MEDICINE: 'CODE', CUSTOMER: 'CUST_ID' };
const tables = (app: string) =>
  Object.fromEntries(
    graveyardTables(app).map((f) => [`${f}.DBF`, readCsv(`${app}/seed/${f}.csv`).records]),
  );
const show = (items: { label: string; ref: string; blank?: string }[]) =>
  items.map((x) => `${x.label}|${x.ref}${x.blank ? `|${x.blank}` : ''}`);

/** The layout from a Shifa scenario's TOTALS screen (the one F2 was pressed on). */
function shifa(scenario: string) {
  const shape = shapeOf(graveyardRun('shifa', scenario, KEYS).dbfDiff, ENTITIES)!;
  return inferReceipt(
    graveyardScreen('shifa', scenario, 'TOTALS'),
    shape,
    ENTITIES,
    tables('shifa'),
  );
}

describe('inferReceipt on the real old screens', () => {
  it('Shifa, a customer’s bill: the NEW BILL layout of the reference Soul, in its order', () => {
    const want = SHIFA_REFERENCE_SOUL.actions.find((a) => a.id === 'save-bill')!.receipt!;
    // What a walk-in shows for the blank customer (WALK-IN) is not on a customer's bill: the
    // actions merge it from a walk-in bill (actions.test.ts).
    expect(shifa('bill-discount')).toEqual({
      ...want,
      header: want.header.map((x) => ({ label: x.label, ref: x.ref })),
    });
  });

  it('Shifa, a walk-in bill of two lines: the customer is blank, shown as WALK-IN', () => {
    const r = shifa('bill-small')!;
    expect(show(r.header)).toEqual([
      'BILL NO|bill.BILL_NO',
      'DATE|bill.BILL_DATE',
      'Customer|bill.CUST_ID|WALK-IN',
    ]);
    expect(r.columns.map((c) => c.ref)).toEqual([
      '#',
      'bill-item.CODE',
      'medicine.NAME',
      'medicine.BATCH',
      'bill-item.PRICE',
      'bill-item.QTY',
      'bill-item.AMOUNT',
    ]);
    expect(show(r.totals)).toEqual([
      'SUBTOTAL|bill.SUBTOTAL',
      'DISCOUNT 10%|bill.DISCOUNT',
      'GST 17%|bill.GST',
      'TOTAL|bill.TOTAL',
    ]);
  });

  it('Iqra, a fee with no lines: totals told apart by their labels when two values are the same', () => {
    const ids = { STUDENT: 'student', PAYMENT: 'payment', FEES: 'fees', FAMILY: 'family' };
    const entities = graveyardEntities('iqra', ids, { STUDENT: ['STU_ID'] }).map((e) =>
      e.id === 'payment'
        ? {
            ...e,
            foreignKeys: [
              { fields: ['STU_ID'], references: { entity: 'student', fields: ['STU_ID'] } },
            ],
          }
        : e,
    );
    const shape = shapeOf(graveyardRun('iqra', 'pay-ontime', {}).dbfDiff, entities)!;
    const r = inferReceipt(
      graveyardScreen('iqra', 'pay-ontime', 'CALC'),
      shape,
      entities,
      tables('iqra'),
    )!;
    expect(r.columns).toEqual([]);
    // MONTHLY FEE and TOTAL are both 2000.00; SIBLING DISCOUNT and LATE FEE both 0.00.
    expect(show(r.totals)).toEqual([
      'MONTHLY FEE (class 7)|payment.FEE',
      'SIBLING DISCOUNT 15%|payment.DISCOUNT',
      'LATE FEE (0 WK)|payment.LATE_FEE',
      'TOTAL|payment.TOTAL',
    ]);
    // The student's name and father, through the payment's link.
    expect(show(r.header)).toContain('Name|student.NAME');
    expect(show(r.header)).toContain('Father|student.FATHER');
  });

  it('a screen with no lines table and no totals gives no layout', () => {
    const empty: ScreenModel = {
      title: null,
      menu: null,
      fields: [],
      labels: [],
      tables: [],
      messages: [],
      texts: [],
      cursor: null,
    } as unknown as ScreenModel;
    const shape = shapeOf(graveyardRun('shifa', 'bill-small', KEYS).dbfDiff, ENTITIES)!;
    expect(inferReceipt(empty, shape, ENTITIES, tables('shifa'))).toBeNull();
  });

  it('a column or label that matches no field is left out', () => {
    const m = graveyardScreen('shifa', 'bill-discount', 'TOTALS');
    const spoilt: ScreenModel = {
      ...m,
      tables: m.tables.map((t) => ({
        ...t,
        columns: [...t.columns, { name: 'COLOUR', col: 70, length: 4, align: 'left' as const }],
        rows: t.rows.map((r) => ({ ...r, cells: [...r.cells, 'BLUE'] })),
      })),
      texts: [
        ...m.texts,
        { text: 'TIP', row: 23, col: 41, highlight: false },
        { text: '9.99', row: 23, col: 62, highlight: false },
      ],
    };
    const shape = shapeOf(graveyardRun('shifa', 'bill-discount', KEYS).dbfDiff, ENTITIES)!;
    const r = inferReceipt(spoilt, shape, ENTITIES, tables('shifa'))!;
    expect(r.columns.map((c) => c.label)).not.toContain('COLOUR');
    expect(r.totals.map((c) => c.label)).not.toContain('TIP');
  });
});
