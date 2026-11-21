# Requirements Document

## Introduction

Prompt 61: the reborn app gives the shop's customer a receipt for each bill. It prints on an 80 mm thermal printer, goes to WhatsApp as text, and downloads as a PDF. The receipt keeps the fields of the old app's bill, in the same order, so a customer sees what they always saw: the old app showed the finished bill on its NEW BILL screen before F2 saved it, and that screen is the layout.

## Glossary

- **Receipt layout**: the fields of a receipt and their order, kept on a Soul action: header lines, line columns and totals, each a label and the field it shows.
- **Receipt**: a saved bill set out by its layout: the shop's name, the header lines, one row per line and the totals.
- **Totals screen**: the old app's screen on which the save key was pressed (Shifa: NEW BILL with SUBTOTAL, DISCOUNT 10%, GST 17% and TOTAL under the lines).
- **Vessel**: the runtime in `packages/vessel` that runs a Soul as the reborn app.

## Requirements

### Requirement 1: The receipt layout in the Soul

**User Story:** As a developer, I want each action's receipt layout kept in its Soul, so that the reborn app and the export print the same receipt.

#### Acceptance Criteria

1. THE Soul SHALL let an action keep a receipt layout of header lines, line columns and totals, each with a label and a field reference.
2. WHEN a receipt layout refers to a field that its entity does not have, THE Soul schema SHALL reject the Soul.
3. THE reference Soul of Shifa SHALL keep the layout of its NEW BILL screen, written from the C source.

### Requirement 2: The layout from the old app's screen

**User Story:** As a shop owner, I want the receipt to show what my old bill screen showed, so that my customers see the same thing.

#### Acceptance Criteria

1. WHEN a save was made on a screen that shows a table of its lines, THE Archaeologist SHALL take the line columns from the table, in order, each matched to the field whose values are the column's cells (the line's own field first, then the record it points at, such as the medicine's name).
2. WHEN that screen shows a label beside a value of the saved record (SUBTOTAL 5200.00), THE Archaeologist SHALL take it as a total, in the order shown, with the label as shown.
3. WHEN that screen shows "Label: value" for a field of the saved record, THE Archaeologist SHALL take it as a header line.
4. WHEN a column or a label matches no field, THE Archaeologist SHALL leave it out.
5. WHEN no screen of a save shows a table or totals, THE Archaeologist SHALL write no layout, and THE Vessel SHALL use a default from the action's fields.
6. THE Archaeologist SHALL start the header with the saved record's key and date fields (the number and day the old app gave the bill when it saved it).

### Requirement 3: Receipts in the reborn app

**User Story:** As a shop owner, I want to print a receipt, send it on WhatsApp, or save it as a PDF, so that my customer leaves with their bill.

#### Acceptance Criteria

1. WHEN a bill is saved in the reborn app, THE reborn app SHALL show its receipt, laid out by the action's receipt layout.
2. WHEN the owner prints, THE reborn app SHALL print only the receipt, 80 mm wide, in a monospaced font.
3. THE reborn app SHALL offer a WhatsApp link whose text is the receipt as plain lines.
4. THE reborn app SHALL offer a PDF of the receipt, 80 mm wide, made without a network call.
5. THE receipt SHALL show money as the old app stored it (two decimals) and dates as the old app showed them (DD/MM/YY).
