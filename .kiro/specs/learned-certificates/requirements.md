# Requirements Document

## Introduction

Prompt 81: a Graveyard app reaches a Rebirth Certificate from the Soul the pipeline learns, not only from the reference Soul our team wrote. Today Iqra and Barkat differ on 50 of 50 proof cases, and Shifa differs whenever two big bills use up the stock, because the learned Soul has no "a quantity larger than the stock is refused" rule. The same gap makes `e2e/exorcism.spec.ts` flaky: its seed is the project id.

## Glossary

- **Line attempt**: one number typed at a field of an action (a bill line's quantity), with the record it is linked to (the medicine whose code was typed before it) and whether the old app took it.
- **Refusal rule**: a `validate` rule comparing a typed number with a field of the linked record or of the same record (`bill_item.qty <= medicine.qty`).
- **Boundary probe**: a bill the Archaeologist asks the Possessor to type, at the value a refusal rule turns on (`qty = stock` and `qty = stock + 1`).
- **Published action**: an action the Surgeon's smoke test passed, so the reborn app offers it.
- **Unworkable rule**: an effect rule whose value the action cannot work out from what the owner types and the records that exist.

## Requirements

### Requirement 1: Refusal rules without a model

**User Story:** As a shop owner, I want the reborn app to refuse what my old app refused, even when no model is set up.

#### Acceptance Criteria

1. WHEN a typed number is refused (a message appears and nothing is written for it) and the same field is taken at a lower value, THE Archaeologist SHALL enumerate comparisons of the field with each numeric field of the linked record and of the same record, and keep only those that every line attempt agrees with.
2. FOR a typed number linked to a record with numeric fields, THE Archaeologist SHALL probe the boundary in the old app (equal to the field, and one over it) when no attempt shows it yet.

### Requirement 2: Unworkable rules

**User Story:** As a judge, I want the reborn app to run only rules it can work out.

#### Acceptance Criteria

1. THE Archaeologist SHALL reject an effect rule the action cannot work out from the fields its key macro types and the records that exist.
2. THE Surgeon's smoke test SHALL type only the macro's fields, like the Oracle; a field the old app works out SHALL never be an input on the reborn app's form.

### Requirement 3: Prove what was published

**User Story:** As a judge, I want the proof to say which actions are not reborn yet instead of failing them.

#### Acceptance Criteria

1. THE Oracle SHALL prove only the actions the Surgeon published, and list the others as "not reborn yet".
2. A recorded run SHALL prove with a fixed seed, so the demo and the e2e give the same answer every time.
3. THE proof cases SHALL not repeat, and SHALL be weighted towards actions with rules.
