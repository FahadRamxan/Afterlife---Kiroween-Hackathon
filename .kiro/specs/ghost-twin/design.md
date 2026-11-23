# Design Document

## Overview

The capture tool is a polling loop over the data folder: snapshot the DBF files, diff against the last look, post the diff. The API checks the twin token and stores the event; the worker replays it in the Vessel (Prompt 77); readiness is worked out from the stored results (Prompt 78); the tab shows it all (Prompt 79).

## Architecture

- `packages/twin/src/capture.ts`: `createCapture({ dir, post, intervalMs })`: `tick()` (one look), `start()`, `stop()`, `pending()`.
- `packages/twin/src/http.ts`: `httpPoster({ api, projectId, token })`.
- `packages/twin/src/cli.ts`, `cli-args.ts`: `afterlife-twin` (`pnpm twin`), flags or `AFTERLIFE_*` environment.
- `apps/api/src/twin.ts`: `POST /api/projects/:id/twin/token`, `POST /api/projects/:id/twin/events` (Bearer token), `GET /api/projects/:id/twin/events`; `PgTwinStore`.

## Components and Interfaces

- `TwinEvent = { seq, occurredAt, files, diff }`, `diff` a `SnapshotDiff`.
- The token: `tw_` and 32 random bytes in base64url; `projects.twin_token_hash` is its SHA-256, compared in constant time.

## Data Models

- `twin_events` (Prompt 35's table): `seq` (unique per project), `occurred_at`, `event` (`{ files, diff }`), `old_result`, `new_result`, `matched`.
- `projects.twin_token_hash` and the `twin` event type: migration 0014 (and its down).

## Correctness Properties

### Property 1: A change is one event, nothing changed is none

For any two looks at the folder, an event is made exactly when a DBF file changed, and its diff is the change.

**Validates: Requirements 1.1**

### Property 2: Events arrive in order, each once

Events the API does not take are sent again before newer ones; a seq already stored is refused (409), which the tool counts as sent.

**Validates: Requirements 1.2, 1.3**

## Error Handling

- Half-written file: skipped this look. API down: the event waits. Token refused: said in the tool's output, and retried.
- No token, a wrong one, or another project's: 401. A body that is not an event (a path in a file name): 400.

## Testing Strategy

- Unit tests of the capture on a temp folder; the CLI as a child process against a mock API; the API in Postgres, including the capture tool posting into it end to end.
