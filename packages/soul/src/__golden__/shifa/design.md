# Design

## Overview

Shifa Medical Store is rebuilt from its Soul (version 1, by reference, from 0 observations). The rules are expressions in the Soul's rule language; they run with decimal arithmetic, never floating point.

## Entities

### Medicine (`MEDICINE.DBF`)

| Field | Type | Width | Decimals |
| --- | --- | --- | --- |
| CODE | C | 6 | 0 |
| NAME | C | 20 | 0 |
| BATCH | C | 8 | 0 |
| EXPIRY | D | 8 | 0 |
| PRICE | N | 8 | 2 |
| QTY | N | 5 | 0 |

- Key: CODE

### Customer (`CUSTOMER.DBF`)

| Field | Type | Width | Decimals |
| --- | --- | --- | --- |
| CUST_ID | C | 5 | 0 |
| NAME | C | 25 | 0 |
| PHONE | C | 12 | 0 |

- Key: CUST_ID
- CUST_ID is numbered by the app: `C####`

### Bill (`BILLS.DBF`)

| Field | Type | Width | Decimals |
| --- | --- | --- | --- |
| BILL_NO | C | 9 | 0 |
| BILL_DATE | D | 8 | 0 |
| CUST_ID | C | 5 | 0 |
| SUBTOTAL | N | 11 | 2 |
| DISCOUNT | N | 10 | 2 |
| GST | N | 10 | 2 |
| TOTAL | N | 11 | 2 |

- Key: BILL_NO
- CUST_ID refers to customer (CUST_ID)
- BILL_NO is numbered by the app: `YYMM-####`

### Bill line (`BILLITEM.DBF`)

| Field | Type | Width | Decimals |
| --- | --- | --- | --- |
| BILL_NO | C | 9 | 0 |
| LINE | N | 2 | 0 |
| CODE | C | 6 | 0 |
| QTY | N | 5 | 0 |
| PRICE | N | 8 | 2 |
| AMOUNT | N | 10 | 2 |

- Key: BILL_NO, LINE
- BILL_NO refers to bill (BILL_NO)
- CODE refers to medicine (CODE)

## Screens

### MAIN MENU (`fp_1eb0f03756fc7646`)

- Choice: row 18, column 40, 1 wide
- `1` goes to NEW BILL
- `2` goes to STOCK
- `3` goes to CUSTOMERS

### NEW BILL (`fp_1ea84e74e2cd7cec`)

- Code: row 21, column 7, 6 wide, bill-item.CODE
- Qty: row 21, column 21, 4 wide, bill-item.QTY
- `{Esc}` goes to MAIN MENU

### STOCK (`fp_94f36efd8f8e0a33`)

- `{Esc}` goes to MAIN MENU

### CUSTOMERS (`fp_7ea2aa4052052a22`)

- `{Esc}` goes to MAIN MENU

## Actions

- **Save a bill** (`{Enter}{F2}` on NEW BILL): inserts bill, inserts bill-item, updates medicine

## Rules

| Id | Kind | Target | Expression | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- |
| `discount-over-5000` | compute | bill.discount | `if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0` | 100% | none yet |
| `gst-17-truncated` | compute | bill.gst | `trunc((bill.subtotal - bill.discount) * 0.17, 2)` | 100% | none yet |
| `bill-total` | compute | bill.total | `bill.subtotal - bill.discount + bill.gst` | 100% | none yet |
| `expired-batch-blocked` | validate |  | `medicine.expiry >= today` | 100% | none yet |
| `qty-over-stock-refused` | validate |  | `item.qty <= medicine.qty` | 100% | none yet |
| `stock-decrement` | effect | medicine.qty | `medicine.qty - item.qty` | 100% | none yet |
| `bill-subtotal` | compute | bill.subtotal | `sum(items, x => x.qty * x.price)` | 100% | none yet |
