# Requirements Document

## Introduction

Prompt 62: a developer who inherits a reborn app gets it as code. "Export" gives a zip with a standalone Next.js app that runs the project's Soul in the Vessel runtime, the Kiro spec and steering the Soul writes, and a property test suite, so the app can keep evolving in Kiro without Afterlife.

## Glossary

- **Export**: the zip of the reborn app, made from a project's newest Soul.
- **Vendored runtime**: the source of `@afterlife/soul`, `@afterlife/dbf` and `@afterlife/vessel` (and the code page table they need), copied into the export so it needs no package of ours.
- **Seed**: the old app's records, the ones the reborn app starts from, as JSON in the export.

## Requirements

### Requirement 1: The export's contents

**User Story:** As a developer, I want the reborn app as a project I can run, so that I can work on it without Afterlife.

#### Acceptance Criteria

1. THE export SHALL contain a Next.js app (`package.json`, `tsconfig.json`, `next.config.mjs`, `app/`) that runs the Soul in the vendored runtime.
2. THE export SHALL contain the Soul (`soul.json`) and the seed records (`data/<FILE>.json`).
3. THE export SHALL contain the Kiro spec and steering the Soul writes, under `.kiro/specs/` and `.kiro/steering/legacy-behaviour.md`.
4. THE export SHALL contain a test suite of properties of the Soul in the runtime: the Soul is valid, every action can be laid out, an action run twice from the same records gives the same effects, and every money value it writes has no more places than its field.
5. THE vendored runtime SHALL import nothing from `@afterlife/*`, and SHALL leave out tests, the database and IndexedDB stores, and the command line.
6. THE export's dependency versions SHALL be the versions the repo itself is tested with.

### Requirement 2: Export in the app

**User Story:** As a developer, I want an Export button on the project, so that I can take the reborn app with me.

#### Acceptance Criteria

1. WHEN a project has a Soul with actions, THE API SHALL serve its export as a zip at `GET /api/projects/:id/export`, named after the app.
2. WHEN the project has no Soul, or a Soul with no actions, or no records to seed it with, THE API SHALL answer 409 and say why.
3. THE Soul tab SHALL have an "Export the reborn app" link that downloads the zip.

### Requirement 3: The export works on its own

**User Story:** As a developer, I want the export to pass its own tests, so that I know it is complete.

#### Acceptance Criteria

1. WHEN the export is unzipped into an empty folder outside the repo, `pnpm install && pnpm test` SHALL pass: the TypeScript check of the app and the runtime, then the property suite.
2. THE local CI SHALL run that check on the export of Shifa's reference Soul.
