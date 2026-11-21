# Design Document

## Overview

A receipt layout on each Soul action, inferred by the Archaeologist from the old app's totals screen, and turned into a receipt by the Vessel. The web app draws the receipt for print, and the Vessel package makes its WhatsApp text and its PDF, so both can be tested without a browser.

## Architecture

- `packages/soul/src/ir.ts`: `ReceiptSchema` (optional `receipt` on an action) and its reference checks.
- `packages/soul/src/examples/shifa.ts`: the NEW BILL layout, from `bill.c` (`draw_bill`, `draw_line`, `show_totals`).
- `packages/crew/src/archaeologist/receipt.ts`: `inferReceipt(model, shape, entities, tables)`, called by `inferActions` on the screen each save was made on.
- `packages/vessel/src/receipt.ts`: `receiptLayout(soul, actionId)` (the layout, or a default), `receiptOf(soul, actionId, result, store)`, `receiptText(receipt)` and `receiptPdf(receipt)`.
- `apps/web/components/VesselReceipt.tsx`: the receipt, with Print, WhatsApp and PDF; `app/globals.css` prints only `.vessel-receipt`, on an 80 mm page.

## Components and Interfaces

- `ReceiptLayout = { header: Item[]; columns: Item[]; totals: Item[] }`, `Item = { label: string; ref: string }`. A `ref` is `entity-id.FIELD` (`bill.CUST_ID`, `medicine.NAME`) or `#` for the line number.
- `inferReceipt(model: ScreenModel, shape, entities, tables?): ReceiptLayout | null`.
- `Receipt = { shop: string; header: { label: string; value: string }[]; columns: string[]; rows: string[][]; totals: { label: string; value: string }[] }`.
- `receiptText(r): string` and `receiptPdf(r): Uint8Array` (a one-page PDF 1.4 in Courier, 226.77 pt wide).

## Data Models

The reference Soul's `save-bill` receipt:

- header: `BILL NO` bill.BILL_NO, `DATE` bill.BILL_DATE, `Customer` bill.CUST_ID, customer.NAME
- columns: `#`, `CODE`, `NAME` (medicine), `BATCH` (medicine), `PRICE`, `QTY`, `AMOUNT`
- totals: `SUBTOTAL`, `DISCOUNT 10%`, `GST 17%`, `TOTAL`

## Correctness Properties

### Property 1: A receipt shows every line and every total of the saved bill

For any bill the Vessel saves, the receipt has one row per line, and each total is the saved record's value.

**Validates: Requirements 3.1, 3.5**

### Property 2: The PDF is well formed

For any receipt (any text, any number of lines), the PDF starts with `%PDF-1.4`, its cross-reference offsets point at its objects, and every receipt line is in its content stream.

**Validates: Requirements 3.4**

### Property 3: The WhatsApp text holds the receipt

For any receipt, every header value, cell and total is in the text, in the order printed: the header, then each line's words (and its number) followed by its amounts, then the totals.

**Validates: Requirements 3.3**

## Error Handling

- A layout field the saved record does not have shows as blank.
- Text the PDF's font cannot show (Urdu) is written as `?` in the PDF only; the printed receipt and WhatsApp keep it.
- A customer that is blank (walk-in) shows as the old app showed it: `WALK-IN`.

## Testing Strategy

- Unit and property tests for the schema, `inferReceipt` (on the old app's real TOTALS.SCR screen dumps), and the Vessel receipt functions.
- A snapshot test of the receipt HTML.
- An e2e test saves a bill in the reborn app, checks the receipt, its print preview (80 mm, nothing else printed), the WhatsApp link and the PDF download.
