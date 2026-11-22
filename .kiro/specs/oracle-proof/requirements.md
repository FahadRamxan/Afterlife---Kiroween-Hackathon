# Requirements Document

## Introduction

Prompts 67 to 70: the Oracle proves the reborn app does what the old app did. It makes up cases from the Soul (each action's inputs, using the old app's own records, biased to the rules' thresholds), runs each case in the old app in the emulator and in the Vessel from the same starting records, and compares their effects in the data files' own diff format. A difference is shrunk to the smallest case that still shows it and explained in a sentence. The Proof tab shows it happen.

## Glossary

- **Oracle**: `packages/oracle` (crew.md): arbitraries, the differential runner and shrinking.
- **Case**: one action with its inputs (a bill's customer and lines), as the owner would type them.
- **Effects**: what a case changed in the data files, as `diffSnapshots` gives it for the old app and `performAction` for the Vessel.
- **Lane**: one emulator and one Vessel, kept in lockstep: each case starts from what the cases before it left, the same on both sides.
- **Counterexample**: the smallest case found that still gives different effects.

## Requirements

### Requirement 1: Arbitraries from the Soul

**User Story:** As a developer, I want cases made up from the Soul, so that the proof covers what the owner can do without anyone writing the cases.

#### Acceptance Criteria

1. FOR each action, THE Oracle SHALL generate inputs for every field the action asks for, valid for the field's type and width.
2. WHEN a field points at another record (a line's medicine, a bill's customer), THE Oracle SHALL use the keys of records that exist, or a blank where the record may go without one.
3. THE Oracle SHALL bias cases to the rules' thresholds: totals one step under, at and over a threshold, the step being the smallest the shop's prices make (5 paisa for Shifa: 4999.95, 5000.00, 5000.05), and the five records whose dates are nearest the app's date.
4. THE Oracle SHALL leave out lines the Soul's own rules refuse at the start (an expired batch, more than the stock), so that a case is one the owner can complete in both apps.
5. EVERY generated input SHALL pass the field validation of the Soul.

### Requirement 2: The differential runner

**User Story:** As a shop owner, I want the reborn app proven against my old app, so that I can trust it.

#### Acceptance Criteria

1. WHEN a proof runs, THE Oracle SHALL run each case in the old app (to the action's screen by the screen graph, its keys by the action's macro) and in the Vessel, from the same records, and compare their effects.
2. THE proof SHALL be repeatable: the same seed gives the same cases, and the cases are fast-check's, so a failing one replays from its seed and path.
3. THE Oracle SHALL run the cases on several lanes at once when the emulator pool has room.
4. WHEN the Vessel refuses a case the state no longer allows (the stock ran out), THE Oracle SHALL count it as skipped, not as a pass or a difference.
5. A changed rule in the Vessel SHALL be found as a difference.
6. THE strict proof on the real app SHALL use the Soul of the app as it really runs (Shifa's two-digit-year expiry check included); the intended Soul SHALL differ from it on exactly the cases of the known bug (a batch good until 2000 or later).

### Requirement 3: Shrinking and the counterexample

**User Story:** As a developer, I want the smallest case that shows a difference, explained, so that I can see what is wrong at once.

#### Acceptance Criteria

1. WHEN a case fails, THE Oracle SHALL shrink it with fast-check to the smallest case that still fails, each try from a fresh start.
2. THE counterexample SHALL be stored with both sides' effects.
3. `explainDifference` SHALL say in one sentence what differs, with both values and the case ("Old app charged Rs 850.00 GST, new app charged Rs 850.01 on a bill of Rs 5000.06").

### Requirement 4: The proof run in the app

**User Story:** As a judge, I want to watch the proof, so that I see old and new agree.

#### Acceptance Criteria

1. THE prove step SHALL run the proof on the project's newest Soul and emit a `proof_case` event per case, and its summary as its output.
2. THE Proof tab SHALL show the old app's screen on the left and the reborn app's values on the right for the case being run, a counter "N / M cases · K differences" with a progress candle, and the case log.
3. WHEN there is a difference, THE Proof tab SHALL show a red difference badge that opens the counterexample with both sides.
