# Design Document

## Overview

What the recorded runs show today: Shifa's learned Soul has no validate rule at all (the reference has four), so the reborn app sells what the 1998 app refuses; Iqra's `add-payment` writes FEE, DISCOUNT, LATE_FEE and TOTAL, which no rule explains and its macro never types, yet the reborn form asks for all four and the smoke test typed "1" into each; Barkat keeps `party.balance = ledger.balance`, one unknown copied into another. The fix: learn refusals from line attempts and boundary probes, drop rules an action cannot work out, publish only actions the reborn app can really do, and prove only those.

## Architecture

- `packages/crew/src/archaeologist/refusals.ts`: `lineAttempts(observations, draft, tables)` and `inferRefusals(attempts, draft)`; `refusalProbes(draft, attempts, tables)` plans the boundary bills.
- `apps/worker/src/entities-step.ts`: after the rules, a refusal round: plan the boundary bills, type them in the old app (the probe runner), read the attempts again, add the refusal rules.
- `packages/crew/src/archaeologist/workable.ts`: `workable(rule, action, soul)`: the fields a rule reads are typed by the macro, worked out by another kept rule, a counter, a key, or a field of a record that exists before the action.
- `packages/crew/src/surgeon/surgeon.ts`: the form's inputs are the macro's fields; an action is published only when every field it writes is typed, worked out by a rule, a counter or a key; the others are listed with what is missing.
- `apps/worker/src/prove-step.ts` and `packages/oracle`: cases only for published actions; the rest listed as "not reborn yet"; a fixed seed on recorded projects; no repeated case; cases weighted by the action's rules.

## Components and Interfaces

- `LineAttempt = { action, entity, field, value, linked: { entity, record } | null, same: record, accepted: boolean, observation }`. An attempt is a step that types a number at a field the screen labels (matched to the data file's field); it is accepted when the save that follows writes a line with that value, refused when a message appears on that step and nothing is written for it.
- A refusal candidate is `L.F <= M.G` or `L.F < M.G` (M the linked record, or L itself), kept only when every accepted attempt satisfies it, every refused one breaks it, and at least one of each exists.
- Boundary probe: for a typed number with a linked record of numeric fields and no refused attempt yet, a bill with one line at `G` and one at `G + 1`, on a record the old app already took in a line.

## Data Models

- New rules are ordinary Soul `validate` rules with their evidence (the observation ids of the attempts). Rebirth step output gains `unpublished: [{ actionId, name, missing }]`; prove step output gains `notReborn: [{ actionId, name, missing }]`.

## Correctness Properties

### Property 1: A kept refusal rule agrees with every attempt

For any set of attempts, a rule `inferRefusals` keeps is true of every accepted attempt and false of every refused one.
**Validates: Requirements 1.1**

### Property 2: Proof cases are distinct

For any seed and count, no two proof cases are the same action with the same inputs.
**Validates: Requirements 3.3**

## Error Handling

- No refused attempt and no record to probe: no refusal rule, and the proof says so if it then differs.
- No published action: no proof cases, the certificate reason says no action is reborn yet, and the Proof tab lists each with what it is missing.

## Testing Strategy

- Unit tests for attempts and refusal inference on recorded and synthetic observations, with properties; workable rules on Barkat's rule; the Surgeon's inputs and publishing on Iqra; the prove step on published actions and the fixed seed; case uniqueness and weighting.
- Re-record the three Graveyard runs; `e2e/exorcism.spec.ts` 10 runs out of 10.
