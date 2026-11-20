// The reference Soul of Shifa Medical Store: written by our team from the sample app's own source
// and manifest (we wrote that 1998-style app). It is the answer key the Archaeologist is scored
// against (Prompt 56) and the fixture for the spec writer's golden test. It is not inferred, and it
// is not exported from the package, so it never reaches the web app's bundle.
// Fields are from the real DBF headers; screen ids are the real fingerprints of the decoded
// screens in packages/screen/fixtures.
import type { Soul } from '../ir';

const MENU = 'fp_1eb0f03756fc7646';
const BILL = 'fp_1ea84e74e2cd7cec';
const STOCK = 'fp_94f36efd8f8e0a33';
const CUSTOMERS = 'fp_7ea2aa4052052a22';

export const SHIFA_REFERENCE_SOUL: Soul = {
  schemaVersion: 1,
  app: { id: 'shifa', name: 'Shifa Medical Store' },
  version: 1,
  provenance: {
    createdAt: '2026-11-19T00:00:00.000Z',
    createdBy: 'reference',
    observationCount: 0,
    note: "Written by the Afterlife team from the sample app's source, as the answer key.",
  },
  entities: [
    {
      id: 'medicine',
      name: 'Medicine',
      file: 'MEDICINE.DBF',
      fields: [
        { name: 'CODE', type: 'C', length: 6, decimals: 0 },
        { name: 'NAME', type: 'C', length: 20, decimals: 0 },
        { name: 'BATCH', type: 'C', length: 8, decimals: 0 },
        { name: 'EXPIRY', type: 'D', length: 8, decimals: 0 },
        { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
        { name: 'QTY', type: 'N', length: 5, decimals: 0 },
      ],
      key: ['CODE'],
      foreignKeys: [],
      counters: [],
    },
    {
      id: 'customer',
      name: 'Customer',
      file: 'CUSTOMER.DBF',
      fields: [
        { name: 'CUST_ID', type: 'C', length: 5, decimals: 0 },
        { name: 'NAME', type: 'C', length: 25, decimals: 0 },
        { name: 'PHONE', type: 'C', length: 12, decimals: 0 },
      ],
      key: ['CUST_ID'],
      foreignKeys: [],
      counters: [{ field: 'CUST_ID', pattern: 'C####' }],
    },
    {
      id: 'bill',
      name: 'Bill',
      file: 'BILLS.DBF',
      fields: [
        { name: 'BILL_NO', type: 'C', length: 9, decimals: 0 },
        { name: 'BILL_DATE', type: 'D', length: 8, decimals: 0 },
        { name: 'CUST_ID', type: 'C', length: 5, decimals: 0 },
        { name: 'SUBTOTAL', type: 'N', length: 11, decimals: 2 },
        { name: 'DISCOUNT', type: 'N', length: 10, decimals: 2 },
        { name: 'GST', type: 'N', length: 10, decimals: 2 },
        { name: 'TOTAL', type: 'N', length: 11, decimals: 2 },
      ],
      key: ['BILL_NO'],
      foreignKeys: [
        { fields: ['CUST_ID'], references: { entity: 'customer', fields: ['CUST_ID'] } },
      ],
      counters: [{ field: 'BILL_NO', pattern: 'YYMM-####' }],
    },
    {
      id: 'bill-item',
      name: 'Bill line',
      file: 'BILLITEM.DBF',
      fields: [
        { name: 'BILL_NO', type: 'C', length: 9, decimals: 0 },
        { name: 'LINE', type: 'N', length: 2, decimals: 0 },
        { name: 'CODE', type: 'C', length: 6, decimals: 0 },
        { name: 'QTY', type: 'N', length: 5, decimals: 0 },
        { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
        { name: 'AMOUNT', type: 'N', length: 10, decimals: 2 },
      ],
      key: ['BILL_NO', 'LINE'],
      foreignKeys: [
        { fields: ['BILL_NO'], references: { entity: 'bill', fields: ['BILL_NO'] } },
        { fields: ['CODE'], references: { entity: 'medicine', fields: ['CODE'] } },
      ],
      counters: [],
    },
  ],
  screens: [
    {
      id: MENU,
      title: 'MAIN MENU',
      fields: [{ label: 'Choice', row: 18, col: 40, width: 1 }],
      navigation: [
        { keys: '1', to: BILL },
        { keys: '2', to: STOCK },
        { keys: '3', to: CUSTOMERS },
      ],
    },
    {
      id: BILL,
      title: 'NEW BILL',
      fields: [
        { label: 'Code', row: 21, col: 7, width: 6, binds: { entity: 'bill-item', field: 'CODE' } },
        { label: 'Qty', row: 21, col: 21, width: 4, binds: { entity: 'bill-item', field: 'QTY' } },
      ],
      navigation: [{ keys: '{Esc}', to: MENU }],
    },
    { id: STOCK, title: 'STOCK', fields: [], navigation: [{ keys: '{Esc}', to: MENU }] },
    { id: CUSTOMERS, title: 'CUSTOMERS', fields: [], navigation: [{ keys: '{Esc}', to: MENU }] },
  ],
  actions: [
    {
      id: 'save-bill',
      screen: BILL,
      name: 'Save a bill',
      keys: '{Enter}{F2}',
      effects: [
        {
          entity: 'bill',
          kind: 'insert',
          fields: ['BILL_NO', 'BILL_DATE', 'CUST_ID', 'SUBTOTAL', 'DISCOUNT', 'GST', 'TOTAL'],
        },
        {
          entity: 'bill-item',
          kind: 'insert',
          fields: ['BILL_NO', 'LINE', 'CODE', 'QTY', 'PRICE', 'AMOUNT'],
        },
        { entity: 'medicine', kind: 'update', fields: ['QTY'] },
      ],
    },
  ],
  rules: [
    {
      id: 'discount-over-5000',
      kind: 'compute',
      target: 'bill.discount',
      en: 'A bill whose subtotal is over Rs 5,000 gets 10% off, truncated to the paisa. Exactly Rs 5,000 gets no discount.',
      ur: '',
      expression: 'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'gst-17-truncated',
      kind: 'compute',
      target: 'bill.gst',
      en: 'GST is 17% of the bill after discount, truncated (not rounded) to the paisa.',
      ur: '',
      expression: 'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'bill-total',
      kind: 'compute',
      target: 'bill.total',
      en: 'The total is the subtotal less the discount, plus GST.',
      ur: '',
      expression: 'bill.subtotal - bill.discount + bill.gst',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'expired-batch-blocked',
      kind: 'validate',
      en: 'A medicine whose batch has expired cannot be added to a bill. A batch that expires today can.',
      ur: '',
      expression: 'medicine.expiry >= today',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'qty-over-stock-refused',
      kind: 'validate',
      en: 'A quantity larger than the stock is refused when the item is added.',
      ur: '',
      expression: 'item.qty <= medicine.qty',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'stock-decrement',
      kind: 'effect',
      target: 'medicine.qty',
      en: "Saving a bill takes the quantity of each item off that medicine's stock.",
      ur: '',
      expression: 'medicine.qty - item.qty',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'bill-subtotal',
      kind: 'compute',
      target: 'bill.subtotal',
      en: 'The subtotal is the sum of the lines, each its quantity times its price.',
      ur: '',
      expression: 'sum(items, x => x.qty * x.price)',
      evidence: [],
      confidence: 1,
    },
    // What the Vessel needs to write a bill line and its bill (Prompt 58): the app takes the price
    // from the medicine, works out each line's amount, and dates the bill with the PC's date.
    {
      id: 'line-price',
      kind: 'compute',
      target: 'bill_item.price',
      en: "A bill line's price is the medicine's price.",
      ur: '',
      expression: 'medicine.price',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'line-amount',
      kind: 'compute',
      target: 'bill_item.amount',
      en: "A bill line's amount is its quantity times its price.",
      ur: '',
      expression: 'item.qty * item.price',
      evidence: [],
      confidence: 1,
    },
    {
      id: 'bill-date',
      kind: 'compute',
      target: 'bill.bill_date',
      en: "A bill is dated the day it is saved, by the PC's clock.",
      ur: '',
      expression: 'today',
      evidence: [],
      confidence: 1,
    },
  ],
};
