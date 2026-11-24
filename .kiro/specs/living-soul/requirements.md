# Requirements Document

## Introduction

Prompts 80 to 83: the Living Soul. The shop owner says a rule change in Urdu or English; it is transcribed, turned into a proposed change to the Soul, verified, and goes live once the owner approves. Prompt 80 is the speech client: recording, transcription and the transcript's normalisation.

## Glossary

- **Speech client**: `SpeechClient` in `packages/crew`: audio in, a transcript (language, text, timed segments) out.
- **Amazon Transcribe**: the speech service (tech.md). It has no Urdu; spoken Urdu is sent as Hindi (`hi-IN`), the closest language it has, and comes back in Devanagari.
- **Fallback provider**: a second speech client tried when the first fails.
- **Normalised transcript**: the transcript with number words as digits and the ways of saying percent as `%` ("paanch feesad" is `5%`).

## Requirements

### Requirement 1: Speech client

**User Story:** As a shop owner, I want to say a rule change in my own words and have its numbers understood.

#### Acceptance Criteria

1. THE system SHALL transcribe a recording through a `SpeechClient`: Amazon Transcribe (Urdu as hi-IN, and English), with a fallback provider tried when it fails; tests SHALL use a fake client and never call the network.
2. THE normaliser SHALL turn number words (Roman Urdu, Urdu script, English, Devanagari; with sau, hazaar, lakh, and dedh, dhai, sawa, saadhe) into digits and the variants of percent into `%`, leaving everyday words that are also numbers ("do", "no") alone unless a percent or another number word is next to them.
3. THE browser SHALL record with MediaRecorder (webm/opus where it has it) and send the recording to the API, which SHALL answer the transcript and its normalised text; a typed request SHALL be normalised the same way, and with no speech service the API SHALL say so instead of inventing text.
4. THE Living Soul tab SHALL let the owner speak or type the change and show what was heard and how its numbers were read.

### Requirement 2: Voice to rule change

**User Story:** As a shop owner, I want my request turned into a proposed rule change I approve.

#### Acceptance Criteria

1. THE LLM SHALL map the request to a rule edit in the DSL (add, modify or remove), with the affected screens and an English and Urdu summary, and ask a clarifying question when the request is ambiguous; nothing SHALL be applied without the owner's approval.
