# Design Document

## Overview

`AnthropicLlmClient` is a thin mapping like `BedrockLlmClient`: the runtime keeps doing the retries, the token budget and the logging, so the SDK's own retries are off.

## Architecture

- `packages/crew/src/llm/anthropic.ts`: `toAnthropicParams`, `fromAnthropicMessage`, `AnthropicLlmClient` over `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.
- `packages/crew/src/llm/config.ts`: `llmClientFrom` takes `anthropic` (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_ID`).
- `apps/worker` and `apps/api` `dev` and `start`: `tsx --env-file-if-exists=.env`.
- `scripts/llm-smoke.ts`: `pnpm llm:smoke`, reading `apps/worker/.env`.

## Components and Interfaces

- `ProviderBlock = { type: 'provider', provider, block }` in `LlmResponse.content`: Claude's thinking and redacted thinking blocks, kept as they came. The runtime already sends the assistant's content back unchanged, so they reach Claude again; the Bedrock mapping leaves out other providers' blocks.
- Capabilities: the tool choice follows the model family (`bedrockCapabilities`); no temperature on any model, as the SDK's request type has none.

## Data Models

- No table. Settings: `LLM_PROVIDER`, `ANTHROPIC_API_KEY` (secret), `ANTHROPIC_MODEL_ID`, in `apps/worker/.env` locally and as `sync: false` in `render.yaml`.

## Correctness Properties

### Property 1: Thinking blocks come back unchanged

For a reply with thinking blocks, sending it back as the assistant's message gives Claude the same blocks, in the same order.
**Validates: Requirements 1.1**

## Error Handling

- A refusal the fallback did not answer, or `max_tokens` with nothing said: an error naming the stop reason.
- `RateLimitError`, `APIConnectionError`, `InternalServerError` (5xx, overloaded): `LlmRetryableError`; anything else (a bad request, a bad key) is final.
- `LLM_PROVIDER=anthropic` with no key: refused at start, with what to set.

## Testing Strategy

- Unit tests with a fake SDK client: the mapping, the setting, a refusal, `max_tokens`, the typed errors, the abort signal.
- A test that a value set only in `.env` reaches the worker's settings, through the same Node flag the scripts use; a test that `llm:smoke` skips without a key.
