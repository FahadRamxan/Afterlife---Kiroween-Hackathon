# Requirements Document

## Introduction

Prompts 76 to 79: Ghost Twin, the shadow mode before switching over. The shop keeps using its old DOS app; a small capture tool watches the app's data folder and sends every change to Afterlife, which works out what the owner did, does the same in the reborn app, and compares. When enough real days match, the shop switches over.

## Glossary

- **Capture tool**: `afterlife-twin` (`packages/twin`), a Node CLI for the shop's PC (DOSBox on Windows), and the same capture in the emulator demo.
- **Twin event**: one change to the DBF files: its diff and when it happened.
- **Twin token**: the per-project secret the capture tool sends its events with; the API keeps only its hash.
- **Match**: the reborn app, given the same inputs, made the same change.
- **Readiness**: days of shadow use, transactions matched, open mismatches and unknown actions, against a rule.

## Requirements

### Requirement 1: Capture

**User Story:** As a shop owner, I want my real day in the old app sent to Afterlife without changing how I work.

#### Acceptance Criteria

1. THE capture tool SHALL look at the data folder at an interval and, when a DBF file changed, send its diff and a timestamp as a twin event.
2. A file caught half written SHALL be read again on the next look; an event the API does not take SHALL be sent again, in order, before newer ones.
3. THE API SHALL take twin events only with the project's twin token, keep only the token's hash, store each event once in order, and announce it as a `twin` event.

### Requirement 2: Replay and compare

**User Story:** As a shop owner, I want each real transaction checked in the reborn app.

#### Acceptance Criteria

1. FOR each twin event, THE system SHALL infer which action happened from the shape of the diff, replay the same inputs in the Vessel, and compare the effects.
2. EACH event SHALL be stored as matched, mismatched or unknown; an unknown one SHALL go back to the Archaeologist as new evidence.

### Requirement 3: Switch-over readiness

**User Story:** As a shop owner, I want to know when it is safe to switch.

#### Acceptance Criteria

1. THE readiness score SHALL count days of shadow use, transactions matched, open mismatches and unknown actions, and say ready when 7 days and 200 or more transactions matched with 0 open mismatches (thresholds configurable).
2. "Switch over" SHALL freeze the old data, run the final migration, and mark the Vessel as primary.

### Requirement 4: The Ghost Twin tab

**User Story:** As a judge, I want to see the twin at work.

#### Acceptance Criteria

1. THE tab SHALL show a calendar of shadow days (a candle per day, green when all matched, red with a mismatch), a live feed of transactions as twin pairs, the readiness meter, and the switch-over button with a confirmation.
2. "Simulate a day in the shop" SHALL replay a realistic recorded day, and the readiness SHALL rise.
