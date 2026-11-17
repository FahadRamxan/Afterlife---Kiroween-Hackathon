---
inclusion: always
---

# Product: Afterlife

Afterlife brings dead DOS business software (Clipper, dBase, FoxPro era) back to life without its source code. Tagline: "Software that outlives its source code."

It is a Kiroween 2026 entry in the Resurrection category, built by Matrix AE.

## Users

- **Small shop owners in Pakistan** (pharmacies, kiryana stores, schools) who still run a 1990s DOS app. They speak Urdu, use cheap Android phones, and face power cuts. They need the same workflow they know, on a phone, offline.
- **Developers** who inherit a legacy app with no source. They need a Kiro spec, a test suite and a code export.
- **Hackathon judges**, who must complete the whole flow in under 5 minutes, with no login.

## What it does

1. Runs the old `.exe` in js-dos (DOSBox in WebAssembly).
2. Drives the keyboard and reads the 80x25 text screen.
3. Diffs the `.DBF` data files after every action to learn the business rules.
4. Writes a typed "Soul" IR and a Kiro spec.
5. Runs the Soul in the "Vessel" runtime as an offline-first PWA.
6. Proves old and new behave the same with differential property-based tests, and signs a certificate.

## The Crew (six product agents)

- **Possessor:** drives the old app and maps every screen.
- **Archaeologist:** diffs the data and infers the rules.
- **Surgeon:** compiles the Soul into the Vessel.
- **Undertaker:** migrates the old data and reconciles totals.
- **Oracle:** runs the differential proof and issues the certificate.
- **Exorcist:** finds legacy bugs; the owner chooses keep or fix.

Details are in `crew.md`.

## Demo flow

1. Graveyard: pick a dead app (Shifa Medical Store, 1998).
2. Raise: watch the ghost cursor explore menus while data changes light up.
3. Soul: rules appear in English and Urdu, plus the Kiro spec.
4. Proof: old vs new split screen, "2,000 cases, 0 differences", certificate issued.
5. Exorcism: "Your app has been rounding tax wrong since 1998. Keep or fix?"
6. Ghost Twin: replay a real shop day, then switch over. The phone still works offline.
7. Living Soul: the owner says a rule change in Urdu, it is reverified and goes live.

## Product rules

- The reborn app is not free-form AI code. It is the Vessel runtime executing the Soul IR.
- Every feature must be visible in the UI. Hidden features do not count.
- The pharmacy flow (billing and stock) must work end to end before other work.
- Label cached demo data honestly as a "recorded run".
- Sample dead apps are written by our team to simulate 1990s software. Say so.
