# Design Document

## Overview

Pure functions in `@afterlife/crew` convert, migrate and reconcile; the worker's undertake step runs them on the old app's bundle and writes the Vessel's records; the web app shows the step's events and report.

## Architecture

- `packages/crew/src/undertaker/convert.ts`: `importRecord(entity, record)`, `exportRecord(entity, typed)`.
- `packages/crew/src/undertaker/migrate.ts`: `migrate(soul, tables)`.
- `packages/crew/src/undertaker/reconcile.ts`: `controlTotals(soul, tables)`, `reconcile(before, after, rejected)`.
- `apps/worker/src/undertake-step.ts`: the step; emits a `log` per table and a `migration` progress event.
- `apps/web/components/DataCrossing.tsx`: the panel.

## Components and Interfaces

- `importRecord(e: Entity, r: DbfRecord): { ok: true; typed: Typed } | { ok: false; field: string; reason: string; fix: string }`.
- `exportRecord(e: Entity, t: Typed): Record<string, DbfValue>`.
- `migrate(soul, tables): { tables: { file, entity, read, deleted, migrated: DbfRecord[], rejected: Rejected[] }[] }`.
- `controlTotals(soul, tables)` gives `{ tables: { file, count, sums: Record<field, string> }[], stockValue: string | null, balances: string | null }`.
- `reconcile(old, migrated, rejected)` gives `{ matches: boolean; lines: { table, total, before, after, ok }[] }`: the old side's totals less the rejected records' share.

## Data Models

- `Typed`: `Record<field, string | Decimal | boolean | null>` (dates as `YYYY-MM-DD`).
- The step's output: `{ tables: [{ file, entity, read, deleted, migrated, rejected }], rejected: Rejected[], reconciliation, written: boolean }`.

## Correctness Properties

### Property 1: export(import(record)) is the record

For any record of an entity's fields with convertible values, exporting the imported record gives the original.

**Validates: Requirements 1.4**

### Property 2: Every live record is migrated or rejected

For any tables, migrated plus rejected equals the live records, per table.

**Validates: Requirements 1.2, 1.3**

### Property 3: A correct migration reconciles; a broken one does not

The migrated records reconcile with the old ones; dropping, adding or changing any one record gives a mismatch naming its table.

**Validates: Requirements 2.2, 2.3**

## Error Handling

- A data file the bundle lacks: the table is reported with 0 records read and the reconciliation does not match.
- Phones have synced sales: the migrated records are not written over theirs; the report says so.

## Testing Strategy

- Unit and property tests of the conversion, the migration and the reconciliation, on Shifa's, Iqra's and Barkat's seed data and on generated records.
- A Postgres test of the step.
- `e2e/undertaker.spec.ts`: every table shows a matching count.
