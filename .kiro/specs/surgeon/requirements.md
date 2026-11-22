# Requirements Document

## Introduction

Prompt 63: the rebirth step of the pipeline. The Surgeon compiles the Archaeologist's Soul into the reborn app: it checks the Soul, compiles its rules, lays out each action, smoke-tests each action on a copy of the old app's records, and publishes the reborn app at the project's Vessel URL. The Raise page shows the moment: the tombstone cracks and the app's card rises, with the link.

## Glossary

- **Surgeon**: the agent in `packages/crew/src/surgeon` (crew.md) that runs the rebirth step.
- **Smoke test**: one run of an action on a copy of the old app's records, with a sample filled in from them.
- **Vessel config**: what the reborn app shows of each action: what the owner types, what the rules work out, whether it prints a receipt.
- **Published**: the reborn app at `/vessel/<project id>`, with the actions that passed.

## Requirements

### Requirement 1: The Surgeon

**User Story:** As a shop owner, I want the reborn app checked before I am given it, so that it never breaks in front of a customer.

#### Acceptance Criteria

1. WHEN the Surgeon operates on a Soul, THE Surgeon SHALL validate it, compile every rule expression (its canonical form and the values it reads), and smoke-test every action.
2. WHEN the Soul does not validate, THE Surgeon SHALL not publish it, and SHALL say why.
3. WHEN an action cannot be laid out (something it changes has no rule) or its smoke test is refused by every sample, THE Surgeon SHALL leave that action out and say why, and publish the others.
4. WHEN no action passes, or the Soul has no actions, THE Surgeon SHALL not publish.
5. THE smoke tests SHALL never change the records the Surgeon was given.

### Requirement 2: The rebirth step

**User Story:** As a judge, I want the pipeline to end with a link to the reborn app, so that I can open it.

#### Acceptance Criteria

1. WHEN the rebirth step runs, THE worker SHALL operate on the project's newest Soul with the old app's records, log each rule and smoke test, and store the Vessel config, the compiled rules, the smoke tests and the Vessel URL as the step's output.
2. WHEN the Soul has actions but none can be published, THE step SHALL fail with the Surgeon's reasons; WHEN there is no Soul, no records, or a Soul with no actions yet, THE step SHALL be skipped and say why.
3. THE recorded runs SHALL include the rebirth step.

### Requirement 3: The reborn moment

**User Story:** As a judge, I want to see the app come back to life, so that the moment is clear.

#### Acceptance Criteria

1. WHEN the rebirth step is done, THE Raise page SHALL show a "Reborn" card with the actions published and a link to the reborn app.
2. THE card SHALL appear with a short Framer Motion animation: the tombstone cracks and the app's card rises; under reduced motion it SHALL appear without moving.
