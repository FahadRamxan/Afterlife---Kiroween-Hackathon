---
inclusion: always
---

# The Crew

Six product agents run in `apps/worker`, coded in `packages/crew`. The pipeline order is possess, archaeology, rebirth, undertake, prove, exorcise. Each step saves its output so it can resume or re-run alone.

Rules for every agent:

- Use the `LlmClient` interface only. Validate every LLM output with zod.
- Deterministic code decides. The LLM proposes values and hypotheses only.
- Log every LLM call and tool call for the "Show your work" panel.
- Emit progress events (`screen`, `observation`, `rule_found`, `soul_updated`, `proof_case`, `exorcism`, `log`).

## Possessor

Drives the old app's keyboard and explores every screen.

- **Inputs:** the js-dos bundle, an `EmulatorController`, an optional séance recording.
- **Outputs:** observations (`{keys, screenBefore, screenAfter, dbfDiff, durationMs}`) and a screen graph (nodes are screen fingerprints, edges are key sequences).
- Uses a frontier queue of unexplored menu items and fields. The LLM only picks sensible input values. Esc always returns to safety. Stops when nothing new appears for N steps or the budget runs out.

## Archaeologist

Infers the business rules from data changes.

- **Inputs:** observations, DBF schemas, screen models, voice-note hints.
- **Outputs:** Soul entities (keys, foreign keys, counters) and rules (English, Urdu, DSL expression, evidence ids, confidence), plus the Kiro spec.
- The LLM proposes 3 to 5 candidate rules per effect. Only rules that explain 100% of the evidence are kept, the simplest wins. If none fit, it asks the Possessor for targeted probes.

## Surgeon

Compiles the Soul into the reborn app.

- **Inputs:** a validated Soul.
- **Outputs:** a Vessel config, compiled rule expressions, a smoke-test report, and the published Vessel URL.

## Undertaker

Moves the old data into the new app.

- **Inputs:** the old app's current DBF files and the Soul entities.
- **Outputs:** records in Postgres and the IndexedDB seed, a list of rejected records with reasons, and a reconciliation report (counts, numeric sums, stock value, balances) that must match exactly.

## Oracle

Proves old and new behave the same.

- **Inputs:** the Soul, the old app (via the emulator and screen graph), the Vessel, a seed and a case count.
- **Outputs:** proof cases (pass or fail), shrunk minimal counterexamples with a plain English explanation, and the signed Rebirth Certificate.
- Uses fast-check arbitraries generated from the Soul, biased to rule thresholds.

## Exorcist

Finds legacy bugs and security flaws.

- **Inputs:** the Soul and observations.
- **Outputs:** findings with evidence, severity, English and Urdu text. The owner chooses Keep (strict proof) or Fix (new Soul version, an accepted divergence listed on the certificate).
