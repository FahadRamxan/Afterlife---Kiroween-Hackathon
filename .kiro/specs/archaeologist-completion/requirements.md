# Requirements Document

## Introduction

The review of Prompts 51 to 60 found that a live raise never reaches the reborn app: the Archaeologist writes no actions, writes no rules without a language model, and never runs the probes its verifier asks for. This spec finishes the Archaeologist so that the Soul it writes from a real possession can run in the Vessel.

## Glossary

- **Archaeologist**: the agent in `packages/crew/src/archaeologist` that turns observations into a Soul.
- **Observation**: one step of possession: the keys pressed, the screens before and after, and the data diff.
- **Action**: a Soul action: what the owner does that writes data (save a bill), with its screen, effects and key macro.
- **Macro**: an action's keys with placeholders: `{@FIELD}` for the record, `{lines}...{/lines}` and `{#FIELD}` for each line.
- **Enumerator**: the candidate rule generator used when no language model is set up.
- **Probe**: a bill the verifier asks to see (a subtotal of exactly 5000), typed into the old app by the Possessor.

## Requirements

### Requirement 1: Actions from the observations

**User Story:** As a shop owner, I want the reborn app to have the same screens for saving that my old app has, so that I can use it without our team writing anything by hand.

#### Acceptance Criteria

1. WHEN a step of possession inserted records, THE Archaeologist SHALL write an action whose effects are the record of its own, the records that point at it (its lines), and the records it changed with the fields that changed.
2. WHEN the keys before a save were typed into fields, THE Archaeologist SHALL write a macro in which each typed value is replaced by the placeholder of the field it was stored in, matched by the field's label and value.
3. WHEN a macro is filled in with the values that were typed, THE Archaeologist SHALL get back exactly the keys that were pressed; a macro that does not SHALL NOT be written.
4. WHEN two screens write the same kind of record, THE Archaeologist SHALL name each action after its screen.
5. WHEN the archaeology step runs, THE worker SHALL store the actions in the Soul version.

### Requirement 2: Rules without a model

**User Story:** As a judge trying the live site, I want the Archaeologist to find the simple rules even when no language model is set up, so that a raise still ends in a reborn app.

#### Acceptance Criteria

1. WHILE no language model is set up, THE Archaeologist SHALL propose candidates from the enumerator: a field times a field, the sum over the lines, a minus b, a minus b plus c, a value looked up through a link, `trunc(x * c, 2)` and `round(x * c, 2)` with `c` from the observed ratios, a threshold rule with `t` from the observations, and `today` for dates.
2. WHEN candidates are checked, THE verifier SHALL keep only one that explains every observation, the simplest, as for the model's candidates.
3. WHEN the enumerator is used, THE archaeology score SHALL not lose precision.

### Requirement 3: Probes in the old app

**User Story:** As a developer, I want the Archaeologist to try the bills it needs to tell rules apart, so that a threshold never crossed in exploration is still found.

#### Acceptance Criteria

1. WHEN the verifier asks for a probe on a sum over the lines, THE probe planner SHALL choose lines from the old app's own records whose total is exactly the value asked for.
2. WHEN the best rule for a value is a constant, THE Archaeologist SHALL ask for exploration probes at larger round values of the field it may depend on.
3. WHEN a probe is planned, THE Possessor SHALL type it into the old app with the action's macro, and the observation SHALL be checked like the others.
4. WHEN a recorded run is replayed, THE worker SHALL store its observations and its Soul, so that the reborn app opens from it.
