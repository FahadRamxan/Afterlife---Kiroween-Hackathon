# Design Document

## Overview

The Exorcist is deterministic: each detector reads the Soul, the old app's records and its observations, and gives findings with their evidence. Where the evidence cannot tell two explanations apart (a late fee: calendar weeks or days?), it plans probes, the worker types them into the old app booted at chosen dates, and a judge decides from what the old app did. No model decides a finding.

## Architecture

- `packages/crew/src/exorcist/types.ts`: `Finding`, `Evidence`, `Smell`, `ExorcistInput`.
- `packages/crew/src/exorcist/detectors.ts`: one function per smell.
- `packages/crew/src/exorcist/late-fee.ts`: `lateFeeProbes(input)` (the dates to probe) and `judgeLateFee(plan, results)`.
- `packages/crew/src/exorcist/exorcise.ts`: `exorcise(input, probeResults?)`: every detector, deduplicated by code, sorted by severity.
- `packages/crew/src/exorcist/score.ts`: `scoreExorcism(findings, knownBugs)`: each manifest bug found when a finding has its smell and target.
- `apps/worker/src/exorcise-step.ts`: the step: the newest Soul, the project's observations, the records from the bundle, the probes on the pool, then `exorcisms` rows (a decision already made is kept) and an `exorcism` event per finding.

## Components and Interfaces

- `Finding = { code, smell, severity, target?, titleEn, titleUr, en, ur, since, evidence: Evidence[] }`. `code` is `<smell>:<entity>.<field>`, unique per project.
- `Evidence = { kind: 'observation' | 'record' | 'rule' | 'probe', ref, text }`.
- The manifests' `knownBugs[].truth = { smell, target? }`: the answer key, hidden from the Crew like `knownRules[].truth`.

## Data Models

- `exorcisms` (Prompt 35's table): `code`, `severity`, `title_en`, `title_ur`, `evidence` (the finding: smell, target, texts, since, evidence), `decision` (`pending`, `keep`, `fix`), `decided_at`.
- The exorcise step's output: `{ soulVersion, findings: [{ code, smell, severity, target, titleEn }], probes }`.

## Correctness Properties

### Property 1: A clean app has no finding

For any data with four-digit dates shown, values well inside their fields, no blank names and unique keys, the detectors give nothing.

**Validates: Requirements 1.7**

### Property 2: Every finding has evidence

For any input, every finding has at least one piece of evidence, a severity, and English and Urdu text.

**Validates: Requirements 1.6**

## Error Handling

- No Soul: the step is skipped and says so. No observations: only the checks on the data files run.
- A probe the old app cannot be driven through: logged, and the late fee is not judged (no finding without evidence).

## Testing Strategy

- Unit tests per detector on small inputs, and properties for clean data.
- The real recorded runs of the three samples, scored against the manifests (`tests/exorcist-score.test.ts`).
- A Postgres test of the step, and the recorded runs made again with it.
