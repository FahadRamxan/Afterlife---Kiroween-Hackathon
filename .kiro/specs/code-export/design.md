# Design Document

## Overview

A pure builder in `@afterlife/vessel` turns a Soul, its seed records and the runtime's source into the export's files; the API reads the source from the repo and zips them. The export's own test suite runs in the local CI, outside the workspace, with a real `pnpm install`.

## Architecture

- `packages/vessel/src/export.ts`: `vendorRuntime(sources)`, `buildExport({ soul, records, runtime })`, `exportZip(files)`, `EXPORT_VERSIONS`, `RUNTIME_PACKAGES`.
- `apps/api/src/export.ts`: `runtimeSources(root)` reads the package sources; `GET /api/projects/:id/export`.
- `apps/web/components/SoulPanel.tsx`: the Export link.
- `scripts/export-check.ts` (`pnpm export:check`, a `ci:local` step): builds Shifa's export, unzips it into a temporary folder, runs `pnpm install --prefer-offline --ignore-workspace` and `pnpm test`.

## Components and Interfaces

- `vendorRuntime(sources: Record<pkg, Record<file, text>>): Record<path, text>`: each package's source under `lib/afterlife/<pkg>/`, with `from '@afterlife/<pkg>'` rewritten to `from '../<pkg>'`; the code page table as `lib/afterlife/screen/index.ts`.
- `buildExport(o): Record<path, text>`: the app files, the Soul, the seed, the Kiro files and the tests.
- `exportZip(files, root): Uint8Array`: the files under one folder named after the app.

## Data Models

```
<app>-reborn/
  package.json  tsconfig.json  next.config.mjs  next-env.d.ts  vitest.config.mts  README.md  .gitignore
  soul.json  data/MEDICINE.json …
  app/layout.tsx  app/page.tsx  app/reborn-app.tsx  lib/reborn.ts
  lib/afterlife/{soul,dbf,vessel,screen}/…
  tests/soul.test.ts  tests/runtime.prop.test.ts
  .kiro/specs/<app>-rebirth/{requirements,design,tasks}.md  .kiro/steering/legacy-behaviour.md
```

## Correctness Properties

### Property 1: The vendored runtime is self-contained

For any package source, after vendoring no file imports `@afterlife/*`, and every relative import names a file of the export.

**Validates: Requirements 1.5**

### Property 2: The export round-trips its Soul and seed

`soul.json` parses to the Soul given, and each `data/<FILE>.json` holds exactly its records.

**Validates: Requirements 1.2**

### Property 3: The export's own suite passes

`pnpm install && pnpm test` passes in the unzipped export (the local CI step).

**Validates: Requirements 3.1, 3.2**

## Error Handling

- No Soul, no actions, or no records: 409 with a code (`NO_SOUL`, `NO_ACTIONS`, `NO_DATA`) and a sentence.
- A Soul that does not validate is never exported (it is parsed first).

## Testing Strategy

- Unit and property tests of the builder (contents, imports, round trips).
- An API test of the route (the zip, its name, the 409s).
- `tests/export-versions.test.ts`: `EXPORT_VERSIONS` match the versions installed in the repo.
- An e2e test clicks Export and reads the zip.
- `pnpm export:check` in `ci:local`.
