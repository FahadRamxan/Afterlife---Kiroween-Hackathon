# Design Document

## Overview

Prompt 80: the owner's voice reaches the API as a recording (base64 in JSON, like a séance's voice note), is transcribed by the configured speech client, and is normalised by a pure function. Prompts 81 to 83 turn the normalised request into a proposed Soul change, verify it and put it live.

## Architecture

- `packages/crew/src/speech/types.ts`: `SpeechClient`, `Transcript`, `FakeSpeechClient` (Prompt 50).
- `packages/crew/src/speech/transcribe.ts`: `TranscribeSpeechClient`: a batch job. The recording is put in an S3 bucket, `StartTranscriptionJob` runs with language identification over the asked languages (ur-PK sent as hi-IN, en-US), it is polled until done, the transcript JSON is read from the same bucket, and the recording, the transcript file and the job are deleted. Batch because it takes MediaRecorder's webm/opus as it is; streaming takes only PCM, FLAC or Ogg Opus.
- `packages/crew/src/speech/fallback.ts`: `FallbackSpeechClient([a, b])`: the first that answers, and which one it was.
- `packages/crew/src/speech/config.ts`: `speechClientFrom(env)`: `SPEECH_PROVIDER` none or transcribe, `TRANSCRIBE_BUCKET`, `AWS_REGION`, and optionally `SPEECH_FALLBACK_REGION` with `TRANSCRIBE_FALLBACK_BUCKET` (a second Transcribe region as the fallback provider).
- `packages/crew/src/speech/normalise.ts`: `normaliseTranscript(text)`, `asciiDigits(text)`.
- `apps/api/src/voice.ts`: `POST /api/voice` `{ audio: { mime, base64 } }` or `{ text }`, answers `{ source, language, transcript, normalised }`.
- `apps/web/lib/voice.ts` and `apps/web/components/LivingSoulTab.tsx`: MediaRecorder, the typed fallback, what was heard.

## Components and Interfaces

- `SpeechClient.transcribe(audio, mime, { languages, signal })` gives `{ language, text, segments }`.
- The normaliser reads tokens split on white space, with punctuation kept on each side; a run of number words becomes one number, a percent word after it joins it as `%`.

## Data Models

- No table: nothing about the owner's voice is kept by Prompt 80. The recording lives in the S3 bucket only until it is transcribed.
- Environment: `SPEECH_PROVIDER`, `TRANSCRIBE_BUCKET`, `AWS_REGION`, `SPEECH_FALLBACK_REGION`, `TRANSCRIBE_FALLBACK_BUCKET` on the API and the worker.

## Correctness Properties

### Property 1: Said numbers become their digits

For any number word, times any of sau, hazaar or lakh, followed by any way of saying percent, the normaliser gives the number's digits and `%`.
**Validates: Requirements 1.2**

### Property 2: Normalising is idempotent

Normalising a normalised text changes nothing.
**Validates: Requirements 1.2**

### Property 3: Ordinary words are left alone

A sentence of shop words with no number in it is unchanged.
**Validates: Requirements 1.2**

## Error Handling

- No speech service: 503 `NO_SPEECH`, and the tab says to type the change. The speech service failing: 502, its own error only in the log (it can name AWS accounts).
- A type Transcribe does not take: refused before anything is uploaded. A job that fails: its reason. A job past its timeout (120 s): given up. Every way out deletes the recording.
- Not audio and not text, an empty text, over 4 MB: 400 or 413. The route has the raise rate limit per address: a transcription costs money and there is no login.

## Testing Strategy

- Unit tests of the normaliser with examples in each script, and fast-check properties; the Transcribe client against fake S3 and Transcribe clients; the fallback chain and the fake client; the config; the route with the fake client; the browser client.
- `e2e/living-soul.spec.ts`: a typed request normalised in English and Urdu script; a recording with the fake microphone reaches the API, which has no speech service in the e2e run.
