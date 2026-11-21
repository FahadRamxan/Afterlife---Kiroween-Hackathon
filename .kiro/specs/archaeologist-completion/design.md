# Design Document

## Overview

Three additions to the Archaeologist, each deterministic and checked against the observations: actions with key macros, a candidate enumerator for when there is no model, and probes typed into the old app. The worker's archaeology step uses all three, and recorded runs keep what they produce.

## Architecture

- `packages/soul/src/macro.ts`: the macro language (`expandMacro`, `macroFields`).
- `packages/crew/src/archaeologist/actions.ts`: `inferActions(steps, entities)`, with `stepFromObservation` (a stored row) and `stepFromEvent` (a recorded event).
- `packages/crew/src/archaeologist/enumerate.ts`: `enumerateCandidates(effects, entities)`.
- `packages/crew/src/archaeologist/probes.ts`: `planProbe(probe, soul, records)` gives the inputs of a bill whose total is the value asked for.
- `apps/worker/src/entities-step.ts`: infers actions and rules, runs probes through the emulator pool, and stores the Soul.
- `apps/worker/src/recording.ts`: a recording keeps the observations and the Soul; replaying stores them.

## Components and Interfaces

- `inferActions(steps: ActionStep[], entities: Entity[]): Action[]`: groups the saves by the record they write and the screen; for each, the shortest macro that explains its keys.
- `macroOf(steps, shape): string | null`: maps each typed value to a field by label and value; lines must be typed the same way; the round trip must give the pressed keys.
- `enumerateCandidates(target, effects, observations, entities): string[]`: the candidates for one value.
- `ProbeRunner`: `(probes) => Promise<EffectObservation[]>`, given to `selectRule`.

## Data Models

- `Action.keys` holds the macro (at most 500 characters), for example `{@CUST_ID}{Enter}{lines}{#CODE}{Enter}{#QTY}{Enter}{/lines}{Enter}{F2}`.
- A recording gains `observations` (the stored rows of the run) and `soul` (the last Soul version).

## Correctness Properties

### Property 1: A macro gives back the keys

For every bill typed the way Shifa takes one, `expandMacro(macro, typed values)` equals the keys that were pressed.

**Validates: Requirements 1.2, 1.3**

### Property 2: The expanded keys always parse

For any values, the keys a macro expands to parse in the key language, and the text typed is the values.

**Validates: Requirements 1.2**

### Property 3: A chosen rule explains every observation

Whatever the enumerator proposes, the rule kept gives the old app's value on every observation.

**Validates: Requirements 2.2**

### Property 4: A planned probe has the total asked for

For any total the old app's prices can make, the planned lines' quantities times prices sum to it exactly.

**Validates: Requirements 3.1**

## Error Handling

- A save no macro explains is still an action, with the save's own keys.
- A probe the old app refuses (an expired batch, too little stock) gives no data change; the planner tries the next plan.
- Without an emulator pool, the probes are logged, not run.

## Testing Strategy

- Unit and property tests for the macro, `inferActions`, the enumerator and the planner.
- `tests/archaeology-actions.test.ts`: on the recorded Shifa possession the actions equal the reference Soul's.
- `pnpm score:archaeology`: the score with the enumerator, kept only with no loss of precision.
- An e2e test raises Shifa from its recorded run and makes a bill in the reborn app from the Archaeologist's own Soul.
