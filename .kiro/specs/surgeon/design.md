# Design Document

## Overview

A deterministic function, `operate(soul, store, {today, url})`, does the Surgeon's work; the worker's rebirth step feeds it the newest Soul and a copy of the old app's records, and stores its report. The web app reads the report from the step's output and shows the Reborn card.

## Architecture

- `packages/crew/src/surgeon/surgeon.ts`: `operate`, with `CompiledRule`, `SmokeTest`, `VesselConfig`, `Operation`.
- `apps/worker/src/rebirth-step.ts`: `rebirthStep({ db, bundleFor })`, in the registry as `rebirth`.
- `apps/api`: the steps API also gives each step's output summary for the rebirth step (`vessel`: its URL and actions).
- `apps/web/components/RebornCard.tsx`: the card and its animation (Framer Motion, `motion` package).

## Components and Interfaces

- `operate(soul: unknown, store: EntityStore, opts: { today: string; url: string }): Promise<Operation>`.
- `Operation = { published, problems, compiled, smoke, config }`.
- A smoke test fills the record's inputs with samples (a number 1, the day, a word), leaves links on the record blank (a walk-in), and for a line tries the records it points at in order (at most 25) until one goes through.

## Data Models

The rebirth step's output: `{ url, soulVersion, published, actions: [{ id, name, ok }], rules: { compiled, failed }, problems, config, smoke }`.

## Correctness Properties

### Property 1: The Surgeon reports, never throws

For any Soul (any rule expressions), `operate` returns a report; when it does not publish, it says why.

**Validates: Requirements 1.2, 1.4**

### Property 2: A smoke test leaves the records as they were

For any Soul, the store's records after `operate` are the records before it.

**Validates: Requirements 1.5**

## Error Handling

- No Soul or no records: the step is skipped with the reason. Nothing publishable: the step fails with the Surgeon's problems (final, not retried).
- An action left out is listed in the step's output and logged as a warning.

## Testing Strategy

- Unit and property tests of `operate` on Shifa's reference Soul and its records.
- A Postgres test of the step (output, events, skip and fail).
- Recorded runs made again; an e2e test sees the Reborn card and its link after a recorded raise, and under reduced motion.
