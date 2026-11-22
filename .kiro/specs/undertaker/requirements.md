# Requirements Document

## Introduction

Prompts 64 to 66: the Undertaker moves the old app's data into the reborn app, proves nothing was lost or changed on the way, and shows it on the Raise page. It reads every data file of the Soul's entities, converts each record field by field, writes the records the Vessel runs on into Postgres (the phones start from them), lists every record it could not convert with the reason and a fix, and computes control totals on both sides that must match exactly. The reconciliation report feeds the certificate (Prompt 71).

## Glossary

- **Undertaker**: the agent in `packages/crew/src/undertaker` (crew.md) that runs the undertake step.
- **Typed record**: a record as the reborn app's types have it: text trimmed, a date as `YYYY-MM-DD` (or none), a number as a decimal, a logical as true or false.
- **Rejected record**: a record that cannot be converted, or would break the reborn app (a key used twice), with the reason and a suggested fix.
- **Control totals**: per table, the count of live records and the sum of every numeric field; overall, the stock value (quantity times price) and the outstanding balances.
- **Reconciliation report**: the control totals of the old data and of the migrated data, side by side, each marked matching or not.

## Requirements

### Requirement 1: Migration

**User Story:** As a shop owner, I want every record of my old app in the new one, so that I can carry on from where I am.

#### Acceptance Criteria

1. WHEN the Undertaker migrates, THE Undertaker SHALL read every data file the Soul's entities name, and convert each live record field by field: text trimmed, a date from `YYYYMMDD` (blank is none), a number to a decimal with no more places than its field, a logical from `T`, `Y`, `F` or `N`.
2. WHEN a field cannot be converted (a date that is not a day of the calendar, text in a number), or a record's key is used by an earlier record, THE Undertaker SHALL reject that record, with the file, the record number, the field, the reason and a suggested fix.
3. THE Undertaker SHALL leave deleted records out, and count them.
4. FOR every record of convertible types, exporting the typed record back to the data file's form SHALL give the original record.
5. WHEN the undertake step runs, THE worker SHALL write the migrated records into the project's Vessel records in Postgres, unless phones have already synced sales into them; and a phone with no Graveyard bundle (an uploaded app) SHALL start from those records.

### Requirement 2: Reconciliation

**User Story:** As a shop owner, I want proof that the totals are the same before and after, so that I can trust the new app with my money and stock.

#### Acceptance Criteria

1. AFTER migration, THE Undertaker SHALL compute on both sides the count of live records per table, the sum of every numeric field per table, the total stock value (each record's quantity times its price, for an entity with both) and the sum of outstanding balances (fields named BALANCE).
2. THE reconciliation SHALL match only if every total is exactly equal (decimal, not floating point), with the rejected records accounted for.
3. WHEN a migration loses, adds or changes a record, THE reconciliation SHALL show the mismatch: which table, which total, both values.
4. THE undertake step SHALL store the reconciliation report as its output, for the certificate.

### Requirement 3: The data crossing panel

**User Story:** As a judge, I want to see the data cross from the old app to the phone, so that the migration is visible.

#### Acceptance Criteria

1. THE Raise page SHALL show a "Data crossing" panel: records as small paper slips moving from the old app's screen to the phone, and a progress bar per table.
2. WHEN the undertake step is done, THE panel SHALL show the reconciliation table, each total with a tick when it matches and a cross when it does not.
3. THE panel SHALL list every rejected record with its reason and the suggested fix.
4. Under reduced motion, the slips SHALL not move.
