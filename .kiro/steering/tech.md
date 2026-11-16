---
inclusion: always
---

# Tech stack

Always prefer these libraries. Do not add an alternative without asking.

## Language and tooling

- TypeScript everywhere, `strict` on. Node 22 LTS.
- pnpm workspaces + Turborepo. Run scripts from the root (`pnpm test`, `pnpm verify`).
- TypeScript 5.9 (pinned, because typescript-eslint does not support 7 yet).
- ESLint flat config + Prettier (single quotes, trailing commas, width 100).

## Web

- Next.js 15 App Router, React 19.
- Tailwind CSS 4, shadcn/ui, Framer Motion.
- next-intl for English and Urdu.
- Vessel PWA: Serwist for the service worker, Dexie for IndexedDB.
- Tables: TanStack Table + TanStack Virtual. Graphs: React Flow.

## API and worker

- Fastify 5 with zod validation and `@fastify/websocket`. Docs with `@fastify/swagger`.
- Queue: pg-boss (jobs on Postgres). Do not add Redis or BullMQ.
- Database: PostgreSQL 16 (Neon in prod, Docker locally) with Drizzle ORM. UUIDv7 ids.
- Live events: Postgres `LISTEN/NOTIFY` to the API, WebSocket to the browser.
- Logs: pino.

## Emulator and legacy data

- js-dos v8 in the browser and in headless Playwright Chromium on the worker.
- Screen reading: our own 80x25 decoder in `packages/screen` (VGA 8x16 glyph matching). No OCR.
- `.DBF` files: our own reader, writer and differ in `packages/dbf`. Pure TypeScript, `Uint8Array` only.
- Sample apps: C compiled with Open Watcom v2 for DOS.

## AI and speech

- Amazon Bedrock, Converse API, Claude Sonnet by default, behind the `LlmClient` interface.
- Amazon Transcribe (Urdu and English) behind the `SpeechClient` interface.
- Always provide a fake client for tests. Unit tests never call the network.

## Maths, proof and signing

- Money and rule maths use decimal.js. Never use JS floats for money.
- Rule DSL: our own parser and evaluator. No `eval`, no `Function`.
- Ed25519 via `@noble/ed25519`, RFC 8785 JSON canonicalisation.

## Testing

- Vitest for unit tests, fast-check for property tests, Playwright for e2e (`/e2e`).
- Follow `testing-rule.md` on every task.

## MCP

- `@modelcontextprotocol/sdk` (TypeScript), stdio transport, server in `packages/mcp-emulator`.

## Hosting and CI

- Vercel (web), Render with Docker on Node 22 (API and worker), Neon (Postgres).
- GitHub Actions for lint, typecheck, unit, PBT and e2e.
- License: MIT, Matrix AE.
