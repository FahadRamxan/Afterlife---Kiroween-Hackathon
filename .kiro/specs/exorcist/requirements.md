# Requirements Document

## Introduction

Prompts 73 to 75: the Exorcist finds the legacy bugs and security flaws of the dead app, from its Soul, its data files and what it did on screen, and the owner decides for each one: keep the old behaviour (the proof stays strict) or fix it (a new Soul version, and an accepted divergence on the certificate). The Exorcism tab shows each finding as a ghost card.

## Glossary

- **Exorcist**: `packages/crew/src/exorcist` and the worker's exorcise step.
- **Finding**: one legacy bug or flaw: a code, a smell, a severity, the field it is about, English and Urdu text, since when, and its evidence.
- **Smell**: the kind of bug: `two-digit-year`, `numeric-overflow`, `negative-allowed`, `date-arithmetic`, `rounding`, `missing-validation`, `duplicate-key`, `hardcoded-password`, `readable-password`.
- **Evidence**: what shows it: a screen the old app showed (an observation), a record in its data files, a rule of the Soul, or a probe typed into the old app.
- **Probe**: a case the Exorcist asks to be typed into the old app, booted at a chosen DOS date, to tell two explanations apart.

## Requirements

### Requirement 1: Legacy bug detection

**User Story:** As a shop owner, I want to know what my old app has been doing wrong, so that I can decide what the new one should do.

#### Acceptance Criteria

1. THE Exorcist SHALL find two-digit years: dates shown with two-digit years, and records the old app treats as past although their four-digit date is not.
2. THE Exorcist SHALL find numeric overflow risks: values written as dBASE's `********`, and fields a rule lets grow past what their width can hold (a limit larger than the balance field).
3. THE Exorcist SHALL find stock or balances allowed below zero: a quantity of 0 taken without the stock check, or a record left negative.
4. THE Exorcist SHALL find date arithmetic that is not what it says: a fee counted in calendar weeks crossed rather than days late, by probes in the old app at chosen dates.
5. THE Exorcist SHALL find missing validation (a blank name saved), duplicate keys, float-like rounding noise, and security issues: password fields readable in a data file, and a password the login screen takes.
6. EVERY finding SHALL have evidence and a severity, English and Urdu text, and since when it has been happening (the earliest year in the data the app wrote).
7. Scored against the manifests, THE Exorcist SHALL find the two-digit-year and negative-stock bugs of Shifa, the late fee bug of Iqra and the balance overflow of Barkat, and nothing on a clean app.

### Requirement 2: Keep or fix

**User Story:** As a shop owner, I want to choose for each bug whether the new app copies it or fixes it.

#### Acceptance Criteria

1. Keep SHALL leave the Soul as it is, so the reborn app copies the old behaviour and the proof stays strict.
2. Fix SHALL write a new Soul version with the corrected rule, re-run the proof on the cases that rule affects, and list the fix as an accepted divergence on the certificate.
3. AFTER a fix, THE proof SHALL pass with the divergence listed, and the certificate SHALL show it.

### Requirement 3: The Exorcism tab

**User Story:** As a judge, I want to see the old app's ghosts and send them away.

#### Acceptance Criteria

1. EACH finding SHALL appear as a ghost card with its title, severity, English and Urdu explanation, its evidence and "since" year, and Keep and Fix buttons.
2. Fix SHALL play a short animation (the ghost dissolves; none under reduced motion), and the count of ghosts left SHALL update.
