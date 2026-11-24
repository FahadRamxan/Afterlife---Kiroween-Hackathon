# Requirements Document

## Introduction

Prompt 80a: before Prompt 81, the worker and the API read their `.env` files, and the Claude API is a model provider next to Amazon Bedrock, for a team with an Anthropic API key instead of AWS.

## Glossary

- **Provider**: where the Crew's model calls go: `bedrock`, `anthropic` or `none` (`LLM_PROVIDER`).
- **Claude API**: Anthropic's own API, through the official SDK `@anthropic-ai/sdk`.
- **Server-side fallback**: a model that declines a request for policy reasons hands it to another model, on the server.

## Requirements

### Requirement 1: Settings and the Claude API

**User Story:** As the team, we want to run the Crew with a Claude API key, set in a local `.env` file.

#### Acceptance Criteria

1. WITH `LLM_PROVIDER=anthropic` THE worker SHALL send its model calls to the Claude API, mapped from `LlmRequest` and back to `LlmResponse` (text and tool_use blocks, the stop reason, the tokens), with no forced tool choice and no temperature on Claude Sonnet 5.5, its thinking blocks sent back unchanged in a tool loop, the server-side fallback on, a remaining refusal or an empty `max_tokens` reply reported as an error, and the SDK's typed errors (rate limit, connection, 5xx) retried. The key SHALL never be logged or printed.
2. THE worker and the API SHALL load their `.env` file when it exists, and run without one.
3. `pnpm llm:smoke` SHALL make one tiny real call when `ANTHROPIC_API_KEY` is set, and skip otherwise.
