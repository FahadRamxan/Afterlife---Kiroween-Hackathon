# Afterlife: 100 Kiro Prompts

How to use this file:

- **Run the prompts in order, inside Kiro IDE.** Paste each one into Kiro chat. For the bigger features, use **Spec mode**, so Kiro creates `requirements.md`, `design.md` and `tasks.md` under `.kiro/specs/`.
- **Owner tags:** **[F]** Fahad, **[S]** Sheheryar, **[Q]** Farquleet.
- **The loop for every prompt (Rule 2 in plan.md):** write tests (Vitest + fast-check) → make them pass → wire into the UI → Playwright e2e → `pnpm verify` green → Conventional Commit → push the branch, open a PR, CI green → merge.
- **Prompt 0 is the master context.** Paste it at the start of every new Kiro session.

---

## Prompt 0: Master context (paste at the start of every session)

> We are building **Afterlife**, a Kiroween 2026 Resurrection entry. It rebuilds business software whose developer and source code are gone (DOS and Windows dBASE, Clipper and FoxPro apps, which keep their data in .DBF files) from just the program and its data. It drives the old app in js-dos (or, for a Windows app, learns from a week of its real transactions), learns the rules from .DBF data diffs, writes a typed "Soul" IR plus a Kiro spec, runs it in a "Vessel" runtime as an offline-first PWA, proves equivalence with differential property-based tests, moves the data across exactly, and issues FBR-ready digital invoices. It is for registered Pakistani businesses whose old billing software FBR's 2025 digital invoicing now forces them to replace (`docs/who-it-is-for.md`).
> Stack: TypeScript, Node 22, pnpm + Turborepo, Next.js 15 + React 19 + Tailwind 4 + shadcn/ui + Framer Motion, Fastify 5 + zod, Postgres 16 + Drizzle, pg-boss, js-dos v8, Playwright, Amazon Bedrock, fast-check + Vitest.
> Follow `.kiro/steering/*` at all times, especially `testing-rule.md`: tests first, then wire into the UI, then e2e, then commit and push. Never skip tests. Keep changes small and explain which files you touched.

---

## Phase 1: Foundation (Prompts 1–10)

### 1. Monorepo scaffold [F]

Create a pnpm workspace monorepo named `afterlife` with Turborepo. Use these folders:

- `apps/web` (Next.js 15 App Router, React 19, TypeScript strict), `apps/api` (Fastify 5), `apps/worker` (Node 22 script)
- `packages/{soul,vessel,dbf,screen,emulator,oracle,crew,certificate,mcp-emulator,ui}`, `powers/afterlife`, `samples/graveyard`, `e2e`, `docs`

Add a shared `tsconfig.base.json` (strict, ES2022, path aliases `@afterlife/*`) and ESLint flat config + Prettier. Root scripts: `dev`, `build`, `test`, `e2e`, `lint`, `typecheck`, `verify` (runs all four checks). Add an MIT `LICENSE` with "Matrix AE" as the copyright holder, a short `README.md`, and a `.gitignore` that does **not** ignore `.kiro/`.
**Done when:** `pnpm verify` passes on the empty skeleton. Commit as `chore: scaffold monorepo`.

### 2. Read the Kiro docs and confirm formats [S]

Read the official Kiro docs at kiro.dev/docs for: steering files, specs, agent hooks, custom agents, Kiro Crew, MCP configuration, powers and property-based testing. Write `docs/kiro-formats.md` summarising the exact file formats, folder locations and frontmatter each feature needs, with a working minimal example of each. Flag anything that differs from the paths used in plan.md (`.kiro/steering`, `.kiro/specs`, `.kiro/hooks`, `.kiro/agents`, `.kiro/settings/mcp.json`, `powers/`).
**Done when:** the doc exists and every later prompt uses the confirmed formats. Commit as `docs: kiro formats`.

### 3. Steering docs [S]

Create these steering files in `.kiro/steering/`:

- `product.md`: what Afterlife is, the users (small shop owners in Pakistan, developers), the six Crew agents, the demo flow
- `tech.md`: the full stack from plan.md section 2, versions, and "always prefer these libraries"
- `structure.md`: the repo layout and naming rules
- `crew.md`: each agent's role, inputs and outputs

Set all of them to always-included. Keep each file under 120 lines, concrete and imperative.
**Done when:** Kiro answers "what stack do we use for queues?" with pg-boss. Commit as `chore(kiro): steering docs`.

### 4. The testing rule steering doc [F]

Create `.kiro/steering/testing-rule.md`, always included. The workflow is:

1. Write Vitest unit tests, plus fast-check property tests for any pure logic, before or with the code.
2. Make them pass.
3. Wire the feature into a real UI screen.
4. Add or extend a Playwright e2e test in `/e2e`.
5. Run `pnpm verify`.
6. Commit only when green, with a Conventional Commit message, and push to a feature branch.

Include examples of a good property test (round-trip, invariant, differential). Also state "never mark a task done if any test is skipped or failing".
**Done when:** Kiro refuses to call a task done without tests. Commit as `chore(kiro): testing rule`.

### 5. Husky pre-commit and commit lint [F]

Add Husky + lint-staged + commitlint (Conventional Commits).

- **pre-commit:** runs `pnpm lint --filter=...[HEAD]`, `pnpm typecheck` and `pnpm test --filter=...[HEAD]`.
- **pre-push:** runs `pnpm verify` including Playwright e2e.

Add `CONTRIBUTING.md` explaining the test → wire → test → commit → push loop, with a checklist.
**Done when:** a commit with a deliberately failing test is blocked. Prove it with a screenshot in `docs/`. Commit as `chore: git hooks`.

### 6. GitHub Actions CI [F]

Create `.github/workflows/ci.yml`, running on PRs and pushes to `main`. Jobs:

- install with the pnpm cache
- lint, typecheck, Vitest with coverage (upload the report as an artifact)
- Playwright e2e against `next build && next start`, with Postgres 16 as a service container

Add a separate nightly workflow that runs the long PBT suites with `FC_NUM_RUNS=2000`. Put the CI badge and coverage summary in the README.
**Done when:** CI is green on a test PR. Commit as `ci: pipeline`.

### 7. Kiro agent hooks [F]

Create these hooks in `.kiro/hooks/` (using the formats confirmed in Prompt 2):

1. **test-on-save:** saving a `packages/**/src/*.ts` file runs that package's tests and reports failures.
2. **pbt-on-oracle-change:** editing `packages/oracle` or `packages/vessel` runs the property suites.
3. **pre-commit-check:** a manual hook that runs `pnpm verify` and summarises the result.
4. **spec-sync:** when a `.kiro/specs/*/tasks.md` task is completed, it checks that a test file references it.
5. **a11y-check:** saving `apps/web/**/*.tsx` runs the axe Playwright check on that page.

**Done when:** each hook fires once and it's logged in `docs/kiro-usage.md`. Commit as `chore(kiro): hooks`.

### 8. Design system "Haunted Ledger" [Q]

In `packages/ui`, build the design system with Tailwind 4 tokens and shadcn/ui.

- **Palette:** graveyard black `#0B0F0C`, phosphor green `#33FF66` (for DOS screens), ectoplasm teal `#5EEAD4`, candle amber `#F5B544`, bone `#EDE6D6`, blood red `#E5484D` (for differences).
- **Fonts:** "IBM Plex Mono" for terminal elements, "Inter" for the UI, "Noto Nastaliq Urdu" for Urdu.
- **Components:** Button, Card, Tombstone, CRTFrame (scanlines + glow, with a `prefers-reduced-motion` fallback), GhostCursor, DiffBadge, ProgressCandle, Certificate frame.
- Add `.kiro/steering/design-system.md` describing the tokens and the rule "spooky effects must also mean something functional".

**Done when:** a Storybook-like `/design` page in apps/web shows every component and its Playwright snapshot test passes. Commit as `feat(ui): design system`.

### 9. Web app shell and routing [Q]

In apps/web, create the layout and these routes:

- `/` landing
- `/graveyard`
- `/raise/[projectId]`, which has tabs: Possession, Soul, Proof, Exorcism, Ghost Twin, Living Soul
- `/vessel/[projectId]`, the reborn app
- `/verify/[certId]`, `/playground`, `/design`

Add a top bar with the Afterlife logo (a candle plus a floppy disk) and a language toggle (English/Urdu, using next-intl), plus empty states for every page.
**Done when:** a Playwright test visits every route and checks the heading. Commit as `feat(web): app shell`.

### 10. Deploy skeleton [F]

Deploy apps/web to Vercel, apps/api and apps/worker to Render (Docker, Node 22), and Postgres to Neon. Add `.env.example` files, a `/health` endpoint on the API, and a status chip in the web footer that shows whether the API is healthy. Document the deploy steps in `docs/deploy.md`.
**Done when:** the production URL loads and the status chip is green, and a Playwright smoke test against the prod URL runs in a manual workflow. Commit as `chore: deploy skeleton`.

---

## Phase 2: The Graveyard (Prompts 11–16)

### 11. Toolchain for the sample dead apps [F]

In `samples/graveyard/toolchain`, set up a Dockerfile with Open Watcom v2 that compiles C code to 16-bit DOS executables. Add a `build.sh` that compiles each sample into `dist/<app>/APP.EXE` and copies the seed `.DBF` files. Write a tiny C helper library `dbf3.c/h` that reads and writes dBASE III `.DBF` files: header, field descriptors, fixed-width records, deletion flag, `0x1A` EOF.
**Done when:** a "hello" EXE builds and runs in DOSBox, and a Vitest test (once Prompt 17 exists) reads its DBF output. Commit as `feat(samples): DOS toolchain`.

### 12. Sample 1: "Shifa Medical Store v2.3 (1998)" [F+Q]

Write a text-mode DOS pharmacy app in C:

- **Menus:** 1 New Bill, 2 Stock, 3 Customers, 4 Daily Report, 5 Exit
- **Data files:** `MEDICINE.DBF` (code, name, batch, expiry, price, qty), `CUSTOMER.DBF`, `BILLS.DBF`, `BILLITEM.DBF`

**Real rules to hide in it:**

- 17% GST, truncated (not rounded) to the paisa
- 10% discount if a bill is over Rs 5,000
- expired batches are blocked
- stock is decremented per item
- bill numbers are `YYMM-####`

**Two deliberate legacy bugs:** a two-digit year in the expiry check (Y2K-style), and a negative stock that's allowed when qty is entered as 0 then edited. Use blue/white 1990s colours.
**Done when:** it runs in DOSBox and seed data has 40 medicines. Commit as `feat(samples): shifa pharmacy`.

### 13. Sample 2: "Iqra School Fees 1.1 (2001)" [Q]

Write a DOS school fee app in C:

- **Data files:** `STUDENT.DBF`, `FEES.DBF`, `PAYMENT.DBF`
- **Rules:**
  - monthly fee by class
  - sibling discount of 15% for the second child
  - late fee of Rs 50 per week after the 10th, capped at Rs 500
  - receipt numbers are sequential

**Legacy bug:** the late fee is calculated on calendar weeks, not days. Use keyboard navigation (arrows, Enter, Esc, F2 to save).
**Done when:** it runs and seeds 60 students. Commit as `feat(samples): iqra school fees`.

### 14. Sample 3: "Barkat Kiryana Ledger (1996)" [S]

Write a DOS shop credit ledger ("khata") in C:

- **Data files:** `PARTY.DBF`, `LEDGER.DBF`
- **Rules:**
  - running balance per customer
  - credit limit per customer, which blocks the sale
  - monthly interest-free reminder list
  - Urdu shop names stored in romanised form

**Legacy bug:** the balance overflows past Rs 99,999.99 because of field width N(8,2).
**Done when:** it runs and seeds 25 parties. Commit as `feat(samples): barkat ledger`.

### 15. Graveyard manifest and packaging [F]

For each sample, create `samples/graveyard/<app>/manifest.json`: name, year, era story (2–3 lines), executable, data file list, a known-rules list (hidden from the agents and used only for scoring), and the known-bugs list. Package each app as a js-dos bundle (`.jsdos` zip with `dosbox.conf` and the files) and copy the bundles to `apps/web/public/graveyard/`.
**Done when:** a Vitest test validates every manifest with zod and checks every bundle exists. Commit as `feat(samples): manifests and bundles`.

### 16. Graveyard page [Q]

Build `/graveyard`: one Tombstone card per dead app, showing the name, the "born–died" years, the era story, and a **Raise** button. Each card has a small idle CRT preview (a static screenshot) with a subtle fog animation. Add an "Upload your own dead app" card that accepts a zip with an EXE and DBF files (wired up later in Prompt 40). Make it responsive at 360px wide.
**Done when:** Playwright checks there are 3 tombstones and that the Raise button navigates to `/raise/<id>`. Commit as `feat(web): graveyard`.

---

## Phase 3: Core packages (Prompts 17–34)

### 17. DBF reader [F]

In `packages/dbf`, implement `readDbf(buffer): {header, fields, records}`. It supports dBASE III and FoxPro 2.x types C, N, F, D, L, M (memo pointer only), handles the deletion flag, code page byte, trailing spaces and empty dates, and is pure TypeScript using Uint8Array only. Write Vitest tests against the sample DBFs.
**Done when:** a fast-check **round-trip property** (`readDbf(writeDbf(x)) == x` for generated tables) holds over 1,000 runs. Commit as `feat(dbf): reader`.

### 18. DBF writer [F]

Implement `writeDbf({fields, records})`, producing byte-exact dBASE III output: correct header length, record length, update date, `0x0D` terminator and `0x1A` EOF. Numeric values are right-aligned, and numbers that don't fit the field width are rejected with a typed error.
**Done when:** these tests pass:

- the round-trip property from Prompt 17
- a golden test showing a file written by our writer opens in the C sample app (run once in DOSBox; record the result in `docs/`)

Commit as `feat(dbf): writer`.

### 19. DBF snapshot and diff [F]

Implement `snapshot(dir)` (hashes plus parsed tables for all DBF files) and `diff(before, after)`. It returns inserted, deleted and updated records, with field-level changes and numeric deltas, matching records by record number and by a detected key field.
**Done when:** these properties hold:

- `diff(a, a)` is empty
- applying the diff to `a` gives `b`
- diff is antisymmetric for inserts and deletes

Commit as `feat(dbf): snapshot and diff`.

### 20. DBF viewer component [Q]

In `packages/ui`, build `<DbfTable>`: a virtualised table (TanStack Table + TanStack Virtual) that shows a DBF with the field types in the header. Add `<DbfDiffView>`, which highlights inserted rows in teal, deleted rows in struck-through red, and changed cells in amber with an old → new tooltip. Wire it into `/design` with sample data.
**Done when:** a Playwright visual test passes, plus a keyboard navigation test. Commit as `feat(ui): dbf table and diff`.

### 21. DBF inspector API [F]

Add `POST /api/dbf/inspect` to apps/api. It takes a multipart upload of DBF files and returns the parsed schema and the first 100 rows, validated with zod and capped at 20 MB. Wire it into the "Upload your own dead app" card so it previews the uploaded tables.
**Done when:** API tests use Fastify `inject`, and an e2e test uploads `MEDICINE.DBF` and sees rows. Commit as `feat(api): dbf inspect`.

### 22. Text-mode screen decoder [S]

In `packages/screen`, implement `decodeScreen(rgba, width, height): ScreenGrid`. It detects an 80x25 or 80x50 text grid in a DOS VGA screenshot by matching each 8x16 (or 9x16) cell against the IBM VGA ROM font glyphs. It returns the characters plus the foreground and background colour indexes per cell, and the cursor position if it's visible. Bundle the font bitmap as a TS asset.
**Done when:** tests against screenshots of the 3 samples give 100% character accuracy. Commit as `feat(screen): decoder`.

### 23. Screen semantics [S]

Add `analyzeScreen(grid)` to `packages/screen`. It finds:

- the title bar and menus (numbered items or highlighted bars)
- input fields (underscores or reverse-video areas, with their position and length)
- labels next to fields, tables (column alignment), and status or error lines

It returns a typed `ScreenModel`. Use deterministic heuristics first and expose a hook so the LLM can refine it later.
**Done when:** snapshot tests cover 10 screens from the samples, plus a property that a re-rendered grid gives the same model. Commit as `feat(screen): semantics`.

### 24. Screen fingerprint [S]

Implement `fingerprint(model)`: a stable hash of a screen's layout that ignores the values typed into fields, the clock, and changing numbers. The Possessor uses it to know whether it's seen a screen before.
**Done when:** these properties hold:

- changing only field values keeps the fingerprint
- changing a label or menu changes it
- the same screen in two runs has the same fingerprint

Commit as `feat(screen): fingerprint`.

### 25. Live CRT component [Q]

Build `<CrtScreen>` in packages/ui. It renders a `ScreenGrid` as crisp text in IBM Plex Mono with the DOS 16-colour palette, inside CRTFrame. It supports overlays: highlight a field, show the ghost cursor at a cell, and a "data changed" pulse. Wire it to `/design` with recorded grids.
**Done when:** a Playwright visual test passes; with `prefers-reduced-motion` on, there's no scanline animation. Commit as `feat(ui): crt screen`.

### 26. Emulator controller interface [F]

In `packages/emulator`, define an `EmulatorController` interface:

- `boot(bundle)`, `sendKeys(seq)` (supports text, Enter, Esc, F1–F12, arrows, Alt combos)
- `screenshot()`, `readFile(path)`, `writeFile(path, bytes)`, `listFiles(dir)`
- `setSpeed(cycles)`, `reset()`, `snapshotState()`, `restoreState()`

Write a key sequence parser (`"1{Enter}PANADOL{Tab}2{F2}"`) with full tests.
**Done when:** a parser round-trip property holds. Commit as `feat(emulator): interface and key parser`.

### 27. Browser js-dos controller [F]

Implement `BrowserJsDos`, which implements EmulatorController using js-dos v8 in the browser: it mounts the bundle, maps the key sequences to js-dos key events with correct timing, reads the frame buffer for screenshots, and reads and writes files in the emulated filesystem. Add a React hook `useEmulator(bundleUrl)`.
**Done when:** an e2e test boots Shifa on `/design`, presses "2" and sees the Stock screen through decodeScreen. Commit as `feat(emulator): browser js-dos`.

### 28. Headless worker controller [F]

Implement `HeadlessJsDos` for apps/worker. It runs the same js-dos page in headless Playwright Chromium and exposes EmulatorController over `page.evaluate`. It supports N parallel instances (a pool with a max size from env) and faster emulation cycles for test runs.
**Done when:** an integration test drives Shifa headless (new bill → save) and confirms that `BILLS.DBF` changed via the DBF diff. Commit as `feat(emulator): headless pool`.

### 29. Action recorder [F]

Add `recordAction(controller, keys)` to packages/emulator. It takes a DBF snapshot, sends the keys, waits until the screen is stable (the same fingerprint for 300 ms), takes another snapshot, and returns `{keys, screenBefore, screenAfter, dbfDiff, durationMs}`. This "observation" record is the core data unit of Afterlife.
**Done when:** tests check that a no-op key gives an empty diff and that saving a bill gives the expected inserts. Commit as `feat(emulator): action recorder`.

### 30. Emulator determinism [F]

Make runs repeatable:

- fix the DOS date and time in `dosbox.conf` (or by hooking them) to a seeded value
- reset the data files from the pristine bundle before each run
- add `withFreshState(fn)`

**Done when:** a property holds that the same key script from a fresh state gives an identical DBF result 20 times out of 20. Commit as `feat(emulator): determinism`.

### 31. Session recording (Séance capture) [Q]

In the web app, add a "Record a séance" mode. The user operates the old app in the browser emulator; every keystroke and the resulting observation (Prompt 29) is recorded, with an optional mic recording of their voice. It saves to the API as a session. It shows a timeline of the recorded actions with screen thumbnails.
**Done when:** an e2e test records 5 actions and sees them in the timeline. Commit as `feat(web): seance recording`.

### 32. MCP server: afterlife-emulator [F]

In `packages/mcp-emulator`, build an MCP server with @modelcontextprotocol/sdk (stdio) exposing these tools:

- `boot_app(name)`, `send_keys(keys)`, `read_screen()` (returns the decoded text and ScreenModel)
- `snapshot_data()`, `diff_data()`, `read_table(file)`, `reset()`

It's backed by HeadlessJsDos.
**Done when:** MCP tool tests use an in-memory client. Commit as `feat(mcp): emulator server`.

### 33. Register MCP in Kiro [F]

Add `.kiro/settings/mcp.json` registering `afterlife-emulator` (using the confirmed format). Then use Kiro chat itself with the MCP tools to explore the Shifa app, and paste the transcript into `docs/kiro-usage.md` under "MCP: Kiro driving a 1998 app". Also use it to generate one real test fixture.
**Done when:** the transcript and fixture are committed. Commit as `chore(kiro): mcp emulator`.

### 34. MCP docs and screenshots [Q]

Write the README section "Use Afterlife's emulator from your own Kiro", with install steps, a tool list, and a GIF of Kiro driving the DOS app. Add a page `/docs/mcp` in the web app rendering this Markdown.
**Done when:** the e2e test checks the page renders. Commit as `docs: mcp guide`.

---

## Phase 4: API, worker and data (Prompts 35–40)

### 35. Database schema [F]

With Drizzle and Postgres, create these tables:

- `projects` (id, name, source app, status)
- `sessions`, `observations` (keys, screen fingerprints, the diff as jsonb)
- `souls` (versioned IR jsonb + spec markdown)
- `proof_runs`, `proof_cases`, `certificates`, `exorcisms`, `twin_events`, `voice_changes`, `registry_patterns`

Add migrations and seed data. Use UUIDv7 ids.
**Done when:** a migration test runs up and down on a clean database in CI. Commit as `feat(api): schema`.

### 36. Projects API [F]

Add these Fastify routes, validated with zod and documented with OpenAPI (`@fastify/swagger`):

- `POST /api/projects` (from a graveyard id or an upload)
- `GET /api/projects/:id`, `GET /api/projects/:id/timeline`
- `DELETE /api/projects/:id`

Add per-IP rate limits for anonymous judges.
**Done when:** these are covered:

- route tests with inject
- an e2e test where clicking Raise creates a project and the UI shows the project id

Commit as `feat(api): projects`.

### 37. Job queue and worker loop [F]

Wire pg-boss:

- **job types:** `possess`, `archaeology`, `rebirth`, `undertake`, `prove`, `exorcise`, `twin-replay`, `voice-change`
- **in apps/worker:** a handler registry with retries, timeouts and an idempotency key per project step

Each job writes progress events.
**Done when:** a test enqueues a fake job, the worker completes it, and the status is updated. Commit as `feat(worker): job loop`.

### 38. Live progress over WebSocket [F]

Add `GET /api/projects/:id/live` (WebSocket). It streams typed events: `screen` (the decoded grid), `observation`, `rule_found`, `soul_updated`, `proof_case`, `exorcism`, `log`. The worker publishes them through Postgres `LISTEN/NOTIFY`. Add a `useProjectLive(id)` hook in the web app with reconnects and a replay of the last 200 events.
**Done when:** an e2e test opens the Raise page and receives screen events from a real headless run. Commit as `feat(api): live stream`.

### 39. Pipeline orchestrator [S]

Implement `runPipeline(projectId)` in the worker. It runs possess → archaeology → rebirth → undertake → prove → exorcise, and each step can be re-run alone. Save every step's output so the pipeline can resume. Add a "demo mode" flag that uses cached outputs from a previous real run to make the judge flow fast (and label it honestly in the UI).
**Done when:** an integration test runs the full pipeline on Shifa in under 10 minutes in CI with reduced case counts. Commit as `feat(worker): pipeline`.

### 40. Upload your own dead app [F]

Finish the upload flow:

- **accept:** a zip containing a DOS EXE/COM plus DBF files, with zip-slip protection, size limits, a file type allow-list and a virus scan (ClamAV in the worker image)
- **then:** build a js-dos bundle on the server, create the project, and send the user to `/raise/<id>`

Run nothing outside the emulator sandbox.
**Done when:** these are covered:

- security tests: a zip-slip path is rejected; a non-DOS binary is rejected
- an e2e upload of a sample zip

Commit as `feat: upload dead app`.

---

## Phase 5: The Soul (Prompts 41–46)

### 41. Soul IR types [S]

In `packages/soul`, define the Soul IR with zod:

- `entities` (from the DBFs: fields, types, widths, keys)
- `screens` (from ScreenModels: fields mapped to entity fields, navigation keys)
- `actions` (a key macro plus its effects)
- `rules` (id, plain English text, Urdu text, an expression in a small safe DSL, the evidence observation ids, a confidence score)
- `version` and `provenance`

**Done when:** a schema test passes, and a property that `parse(serialize(soul))` round-trips. Commit as `feat(soul): IR`.

### 42. Rule expression DSL [S]

Implement a tiny, safe expression language for rules:

- arithmetic, comparisons, `if/then/else`
- `round`, `trunc`, `floor`, `ceil`, `min`, `max`
- date functions (`addDays`, `weeksBetween`), field references (`item.qty`), aggregates (`sum(items, x => ...)`)

Write a parser (Chevrotain or a hand-written Pratt parser) plus an evaluator using decimal arithmetic (decimal.js). There must be no `eval` and no network access.
**Done when:** these properties hold:

- `parse(print(ast)) == ast`
- evaluation is deterministic
- money maths never uses floats

Commit as `feat(soul): rule DSL`.

### 43. Soul to Kiro spec writer [S]

Implement `writeKiroSpec(soul)`, which outputs a real Kiro spec folder:

- `requirements.md`: user stories, and EARS acceptance criteria generated from the rules ("WHEN a bill total exceeds 5000 THE SYSTEM SHALL apply a 10% discount")
- `design.md`: entities, screens, the rule table with evidence links
- `tasks.md`

Also emit `.kiro/steering/legacy-behaviour.md` for developers who continue in Kiro.
**Done when:** golden tests pass for Shifa, and the generated spec opens in Kiro correctly (check it manually once). Commit as `feat(soul): kiro spec writer`.

### 44. Soul viewer screen [Q]

Build the "Soul" tab on `/raise/[id]`:

- the entities as cards
- the rules as a list, each with the English and Urdu text, the DSL expression in a code block, a confidence bar, and an "evidence" button that replays the observation (CRT before/after plus the DBF diff)
- a "Download Kiro spec" button (a zip)

**Done when:** an e2e test opens a rule's evidence and downloads the spec zip. Commit as `feat(web): soul viewer`.

### 45. Soul versioning [F]

Every change to a Soul creates a new version with a diff (rules added, removed or changed). Add `GET /api/projects/:id/souls` and a version timeline UI with "compare two versions".
**Done when:** these properties hold:

- applying a version's diff to the previous version gives the new one
- versions are immutable

Commit as `feat: soul versions`.

### 46. Urdu translation of rules [S]

Use Bedrock to translate each rule's plain English text into simple Urdu (Nastaliq script), with a glossary for shop terms (bill, stock, GST, udhaar). Cache translations per rule hash. Show them in the Soul viewer and the reborn app.
**Done when:** these tests pass:

- the glossary is applied
- the cache is hit on a re-run
- an e2e test shows Urdu text appears when the language toggle is set to Urdu

Commit as `feat(soul): urdu`.

---

## Phase 6: Possessor (Prompts 47–52)

### 47. LLM client and crew runtime [S]

In `packages/crew`, build:

- a `LlmClient` interface with a Bedrock implementation (Converse API, Claude Sonnet, tool use, JSON mode via zod schemas)
- retries, a token budget per project, and full request/response logging to the database for the "show your work" panel

Add a fake LLM for tests.
**Done when:** unit tests with the fake client cover tool calls and schema validation failures. Commit as `feat(crew): llm runtime`.

### 48. Possessor exploration loop [S]

Implement the Possessor agent:

1. read the screen (ScreenModel)
2. pick the next action from unexplored menu items and fields using a frontier queue
3. use the LLM only to choose sensible input values ("a medicine name", "a quantity")
4. record the observation
5. update the screen graph (nodes are fingerprints, edges are keys)

Stop when nothing new has been found for N steps or the budget is used up. Esc always returns safely.
**Done when:** an integration test on Shifa reaches every menu screen with at least 1 save action each. Commit as `feat(crew): possessor`.

### 49. Input value strategy [S]

Make the Possessor's inputs smart and varied:

- infer field types from the label, width and DBF schema
- try boundary values: 0, max width, negatives, past and future dates, and existing vs new keys
- capture error messages shown on the status line as observations too

These probes are what reveal hidden rules.
**Done when:** a property test checks that generated inputs always fit the field width and type. Commit as `feat(crew): input strategy`.

### 50. Guided possession from a séance [S]

If a séance session exists (Prompt 31), the Possessor first replays the owner's recorded paths, then explores the gaps. Transcribe the owner's voice notes and attach them to the matching observations as hints for the Archaeologist.
**Done when:** a test shows guided mode reaches the save action in fewer steps than blind mode. Commit as `feat(crew): guided possession`.

### 51. Possession Theater UI [Q]

Build the "Possession" tab, the hero screen of the demo:

- **the live CrtScreen** with a glowing GhostCursor moving to the cell being typed
- **a side panel** with the screen graph (React Flow, nodes lighting up as they're discovered), a live counter (screens found, actions tried, data changes seen), and a log of what the agent is "thinking" in one-line plain English
- **a "data changed" pulse** that flies from the screen into a DbfDiffView card

**Done when:** an e2e test watches a live possession run and sees the counters increase. Commit as `feat(web): possession theater`.

### 52. Screen graph store and replay [F]

Persist the screen graph. Add `replayPath(controller, from, to)`, which uses the shortest key path between screens. The Oracle and Ghost Twin use it to reach any screen quickly.
**Done when:** a property holds that for random pairs of discovered screens, `replayPath` arrives at the target fingerprint. Commit as `feat: screen graph replay`.

---

## Phase 7: Archaeologist (Prompts 53–57)

### 53. Entity and key detection [S]

From the DBF schemas plus the observations, infer:

- primary keys (unique, never updated), foreign keys (values matching another table's key)
- counters (bill numbers: their pattern and how they increment), and derived fields

Write the results into Soul `entities`.
**Done when:** on Shifa, it detects `MEDICINE.code`, the `BILLITEM.bill_no` → `BILLS.bill_no` link and the `YYMM-####` pattern, and unit tests cover each detector. Commit as `feat(crew): entity detection`.

### 54. Rule hypothesis generation [S]

For each observation with numeric deltas, ask the LLM to propose candidate rule expressions in our DSL (Prompt 42), using the screen inputs, field labels and the before/after values. Ask for 3–5 candidates per effect, including the rounding variants (round, truncate, floor) and threshold variants.
**Done when:** a schema-validated test with a fake LLM passes, and the prompt templates are stored in `packages/crew/prompts/`. Commit as `feat(crew): rule hypotheses`.

### 55. Rule verification and selection [S]

Check every candidate rule **deterministically** against all the observations. Keep only the ones that explain 100% of the evidence, and prefer the simplest (fewest AST nodes). If nothing fits, ask the Possessor for targeted probes (for example "try a bill of exactly 5000 and 5001") and repeat. Compute a confidence score from the evidence count and probe coverage.
**Done when:** these are covered:

- a property that a selected rule reproduces every recorded observation
- a test that it finds Shifa's truncated 17% GST and the 5000 threshold

Commit as `feat(crew): rule verification`.

### 56. Archaeologist scoring against hidden truth [F]

Build a scoring script that compares the inferred Soul with each sample's hidden `manifest.knownRules`: precision, recall and an exact-expression match. Run it in CI nightly and show the score in the README ("Afterlife recovered 11 of 12 hidden rules in Shifa").
**Done when:** the score is computed for all 3 samples and a regression test fails if the score drops. Commit as `test: archaeology scoring`.

### 57. Rule discovery animation [Q]

In the Soul tab, when a `rule_found` event arrives, a candle lights and the rule card writes itself in (a typewriter effect, skipped under reduced motion). Then the evidence observations fly in as small CRT thumbnails. Add a summary banner: "12 rules exhumed from 143 observations".
**Done when:** an e2e test checks the banner count matches the API. Commit as `feat(web): rule animation`.

---

## Phase 8: Surgeon and Vessel (Prompts 58–63)

### 58. Vessel runtime core [S]

In `packages/vessel`, implement a runtime that takes a Soul and provides:

- the entity stores (an interface with in-memory, IndexedDB and Postgres adapters)
- `performAction(actionId, inputs)`, which applies the rules in the DSL and returns the effects in **the same diff format as the DBF differ**, so old and new results can be compared directly

Use decimal arithmetic everywhere.
**Done when:** these properties hold:

- performing an action then reading back gives the stated effects
- the runtime is deterministic

Commit as `feat(vessel): runtime`.

### 59. Vessel UI generator [Q]

Build `/vessel/[projectId]`, which renders the reborn app from the Soul:

- a menu becomes a modern bottom navigation on mobile and a sidebar on desktop
- each screen becomes a form or table using shadcn components
- labels are translated, with an Urdu toggle; big touch targets
- fast billing: a search-as-you-type medicine picker and a running total

The layout must feel like a 2026 app while keeping the same workflow the owner knows.
**Done when:** an e2e test makes a full bill in the Vessel and checks the totals. Commit as `feat(web): vessel ui`.

### 60. Offline-first PWA [Q]

Make the Vessel a PWA with Serwist:

- installable, with an app shell cached offline
- data in Dexie (IndexedDB)
- a sync queue that pushes changes to the API when back online, with a conflict policy of last-writer-wins plus a review list for stock conflicts
- an "Offline, saved on this phone" banner

**Done when:** Playwright sets the context offline, makes 3 bills, goes back online and checks the server has them. Commit as `feat(vessel): offline pwa`.

### 61. Print and share receipts [Q]

Add receipt output in the Vessel: an 80mm thermal printer layout (CSS print), a WhatsApp share link with the text summary, and a PDF download. Keep the old app's receipt fields and order, so the shop's customers see the same thing.
**Done when:** a snapshot test of the receipt HTML passes, and an e2e test checks the print preview. Commit as `feat(vessel): receipts`.

### 62. Code and spec export [S]

Add "Export" to produce a zip containing:

- a standalone Next.js app that embeds the Soul and the Vessel runtime
- the generated `.kiro/specs/` and `.kiro/steering/legacy-behaviour.md`
- the property test suite, so developers can keep evolving the app in Kiro

**Done when:** a CI job unzips the export, runs `pnpm install && pnpm test`, and it passes. Commit as `feat: export reborn app`.

### 63. Surgeon agent step [S]

Wire the "rebirth" pipeline step:

1. validate the Soul
2. compile all rule expressions
3. build the Vessel config
4. run a smoke test of each action against the runtime
5. publish the Vessel URL for the project

Show the "Reborn" moment in the UI: the tombstone cracks and the app card rises, as a short Framer Motion animation.
**Done when:** an e2e test sees the Vessel link appear after the rebirth step. Commit as `feat(crew): surgeon`.

---

## Phase 9: Undertaker (Prompts 64–66)

### 64. Data migration [F]

Implement the Undertaker:

- read every DBF from the old app's current data
- map the records into Vessel entities (a type conversion per field: trim strings, dates from `YYYYMMDD`, numerics to decimals)
- write them into Postgres and the IndexedDB seed

Log every record that couldn't be converted, with the reason.
**Done when:** a property holds that `export(import(dbf))` equals the original records for convertible types. Commit as `feat(crew): undertaker migration`.

### 65. Reconciliation report [F]

After migration, compute control totals on both sides: record counts per table, the sum of every numeric field, total stock value, and the sum of outstanding balances. All must match exactly. Generate a reconciliation report, which feeds into the certificate.
**Done when:** these tests pass:

- a deliberately broken migration gives a mismatch
- a correct one gives all green

Commit as `feat(crew): reconciliation`.

### 66. Undertaker UI [Q]

Build a "Data crossing" panel: records flow as small paper slips from the CRT to the phone, with progress per table and then the reconciliation table with green ticks. Any rejected records are listed with a "fix" suggestion.
**Done when:** an e2e test checks every table shows a matching count. Commit as `feat(web): undertaker panel`.

---

## Phase 10: Oracle and certificate (Prompts 67–72)

### 67. Arbitraries from the Soul [F]

In `packages/oracle`, generate fast-check arbitraries automatically from the Soul:

- for each action, valid inputs per field type and width
- references to existing keys (an existing medicine code, existing student)
- edge-biased values near rule thresholds (4999.99, 5000, 5000.01) and dates near cutoffs

**Done when:** a property holds that every generated input passes the Soul's field validation. Commit as `feat(oracle): arbitraries`.

### 68. Differential runner [F]

Implement `proveEquivalence(project, {numRuns, seed})`. For each generated case:

1. from an identical starting state, run the action in the old app (via the emulator, the replayPath and a key macro) and in the Vessel
2. diff the old DBF effects against the Vessel effects
3. record pass or fail

Use the headless pool for parallel cases, and fast-check's `asyncProperty` with replay seeds.
**Done when:** this is covered:

- an integration test with 200 runs on Shifa passes
- a deliberately changed Vessel rule is caught and shrunk to a minimal case

Commit as `feat(oracle): differential runner`.

### 69. Shrinking and minimal counterexample view [F]

When a case fails, use fast-check shrinking to get the minimal input. Store it with both effect diffs. Provide `explainDifference(case)`: a plain-English sentence ("Old app charged Rs 850.00 GST, new app charged Rs 850.01 on a bill of Rs 5000.06").
**Done when:** tests check the shrunk case is minimal and the explanation includes both values. Commit as `feat(oracle): shrinking`.

### 70. Proof Run UI [Q]

Build the "Proof" tab:

- a split screen: the old CRT on the left and the Vessel on the right, both showing the current case being typed
- a giant counter "1,284 / 2,000 cases · 0 differences" with a progress candle
- the case log streaming below
- if a difference appears, a red DiffBadge that opens the minimal counterexample with both sides

**Done when:** an e2e test runs a 50-case proof and sees the final summary. Commit as `feat(web): proof run`.

### 71. Rebirth certificate [F]

In `packages/certificate`, build a certificate JSON containing:

- the project, the Soul hash, the old bundle hash
- proof stats (cases, seed, differences, accepted divergences from the Exorcist)
- the reconciliation totals, a timestamp and the Afterlife version

Canonicalise it (RFC 8785), sign it with Ed25519 (the key from env, with the public key published at `/.well-known/afterlife-key`), and store it.
**Done when:** these properties hold:

- verification passes for an untouched certificate
- any byte change fails verification

Commit as `feat(certificate): sign and verify`.

### 72. Certificate page and verify flow [Q]

Build `/verify/[certId]`: a beautiful "Certificate of Rebirth" (in the style of an old death certificate: bone paper, a wax seal, candle amber), showing the app name, "Died 1998 · Reborn 2026", the proof stats, the reconciliation summary, a QR code back to the verify URL, and a live "Signature valid ✓" check done in the browser with the public key. Add a PDF download.
**Done when:** these e2e tests pass:

- a valid certificate shows valid
- a tampered JSON shows invalid

Commit as `feat(web): certificate page`.

---

## Phase 11: Exorcist (Prompts 73–75)

### 73. Legacy bug detection [S]

Implement the Exorcist. It analyses the Soul and observations for:

- **known legacy smells:** two-digit years, numeric field overflow risks (value near the field width), negative stock or balance allowed, float-like rounding errors, missing validation (empty names), duplicate keys allowed
- **security issues** seen on screens (hardcoded passwords in the login screen, readable password fields in a DBF)

Each finding has evidence and a severity.
**Done when:** it finds the 2 deliberate bugs in Shifa, the late fee bug in Iqra and the overflow in Barkat (scored against the manifests). Commit as `feat(crew): exorcist`.

### 74. Keep or fix decisions [F]

For each finding, the owner chooses **Keep old behaviour** (the Vessel copies it exactly, and the proof stays strict) or **Fix** (the Vessel uses the corrected rule, and the Oracle records it as an _accepted divergence_ that's listed on the certificate). A fixed rule creates a new Soul version and re-runs the affected proof cases only.
**Done when:** these tests pass:

- after a fix, the proof passes with the divergence listed
- the certificate shows it

Commit as `feat: keep or fix`.

### 75. Exorcism UI [Q]

Build the "Exorcism" tab. Each finding appears as a ghost card with:

- a title, a severity, a plain English and Urdu explanation
- the evidence replay, and since when it's been happening ("since 1998")
- two big buttons: **Keep** / **Fix**

Fixing plays a short "exorcised" animation (the ghost dissolves), and the counter of remaining ghosts updates.
**Done when:** an e2e test fixes one finding, keeps one, and sees the certificate updated. Commit as `feat(web): exorcism`.

---

## Phase 12: Ghost Twin (Prompts 76–79)

### 76. Twin capture agent [F]

Build "Ghost Twin" shadow mode: a tiny capture tool that watches the real shop's data folder (in the emulator demo, and as a documented small Node CLI `afterlife-twin` for a real Windows PC running DOSBox). Every time the DBF files change, it sends the DBF diff and a timestamp to the API as a twin event.
**Done when:** these are covered:

- a test where the CLI detects changes in a temp folder and posts events
- a mock API test

Commit as `feat(twin): capture`.

### 77. Twin replay and compare [F]

For each twin event, infer which action happened (by matching the diff shape to Soul actions), replay the same inputs in the Vessel, and compare the effects. Store matched, mismatched and unknown results. Unknown actions go back to the Archaeologist as new evidence (the Soul keeps learning).
**Done when:** these are covered:

- a test feeding 50 recorded real-style events gives 50 matches
- an injected wrong rule gives a mismatch

Commit as `feat(twin): replay`.

### 78. Switch-over readiness [F]

Compute a switch-over readiness score: days of shadow use, transactions matched, mismatches open, and unknown actions. The rule: "Ready to switch when 7 days and 200+ transactions have matched with 0 open mismatches", with the thresholds configurable. Add a "Switch over" action that freezes the old data, runs the final migration, and marks the Vessel as primary.
**Done when:** unit tests cover the readiness rules, and an e2e test runs a simulated week (time travel in demo mode). Commit as `feat(twin): readiness and switch`.

### 79. Ghost Twin UI [Q]

Build the "Ghost Twin" tab:

- **a calendar** of shadow days, each day a candle (green when all matched, red when there's a mismatch)
- **a live feed** of real transactions as twin pairs (old vs new)
- **the readiness meter**, and the switch-over button with a confirmation

Add a "simulate a day in the shop" button for judges, which replays a realistic recorded day.
**Done when:** an e2e test simulates a day and sees the readiness rise. Commit as `feat(web): ghost twin`.

---

## Phase 13: Speech (Prompt 80)

### 80. Speech client [S]

In `packages/crew`, add a `SpeechClient` interface with an Amazon Transcribe implementation (Urdu + English, streaming or batch) and a fallback provider, recording audio in the browser with MediaRecorder (webm/opus). Normalise the transcript (numbers in Urdu words → digits, "percent" variants).
**Done when:** these tests pass:

- unit tests for the normaliser (for example "paanch feesad" → 5%)
- a fake speech client test

Commit as `feat(crew): speech`.

---

## Revised on 2026-11-24: Prompts 81 to 100

Three things changed the plan:

- **The review of Prompts 61 to 80** (`kiroween-2026/review-prompts-61-80.md`): without a model, no sample app reaches a certificate from its own Soul.
- **A blind test on an app we never tuned for** (`kiroween-2026/holdout-kanta`, a 1999 weighbridge): it stalled at the main menu, and after small fixes it still could not save the main transaction.
- **Market research** (`docs/who-it-is-for.md`): the people who need Afterlife are **registered Pakistani businesses whose billing software's developer and source code are gone**. They are distributors, wholesalers, manufacturers, pharma distributors, larger pharmacies and chains, and they run FoxPro, Visual FoxPro, Clipper or dBASE programs, often on Windows. FBR's 2025 digital invoicing (SRO 709 and SRO 1413) forces them off that software now: every invoice must get FBR's 22-digit number and QR code. Plain DOS at a kiryana counter is rare, so DOS is the hardest case we demo, not the market.

What changed in the plan:

- **Cut:** the old Prompt 87 ("Show your work" already exists) and Prompts 92 and 93 (Haunted Registry).
- **Merged:** 81 with 82, 86 with 88, 89 with 90, 94 with 97, 95 with 96.
- **New:** deploy, DBF dialects, the FBR digital invoice, and raising an app from its data alone.
- **UI (added later the same day):** 87 now restyles the reborn app (daylight, the old app's keys, the owner's phone), 93 carries the seven moments itself, and the design reference is `docs/ui/afterlife-ui-update.html`.
- **Added on 25 November:** 80a (reading the `.env` files, and the Claude API as a model provider, before 81), the README refresh in 100, and Phase 21 (Prompts 101 to 104, after judging).
- **25 November, after 80a and 81 were merged:** the review gave Claude room to think (low effort and a thinking allowance on every call). What 81 left moved into 82 (the screen reader, refusals on every typed field, rules that belong to one action, Barkat without a model) and 83 (a certificate says which actions it covers). The model checks of 80a and 81 are a step of their own: "After 81", below.
- **The order matters:** 81 to 84 first.

---

## Before Prompt 81: the settings and the Claude API (Prompt 80a)

### 80a. The `.env` files, and the Claude API as a model provider [F]

The first bullet is needed either way; the rest only if the team uses a Claude API key instead of Bedrock (Bedrock stays). Do it right after the review branch is merged and before 81, so the model parts of 81 can run.

- **Read the `.env` files:** today nothing loads `apps/worker/.env` or `apps/api/.env`, although both `.env.example` files say to copy them; the worker and the API read only their environment. Make their `dev` and `start` scripts load the file when it exists (for example `tsx --env-file-if-exists=.env`), with a test that a value set only in `.env` reaches the worker's settings.

- **The client:** a new `packages/crew/src/llm/anthropic.ts`, `AnthropicLlmClient implements LlmClient`, with the official SDK `@anthropic-ai/sdk` (added to `packages/crew`). Map our `LlmRequest` to `client.messages.create` (system, messages, tools with our JSON schemas as `input_schema`) and the reply back to `LlmResponse` (text and tool_use blocks, the stop reason, input and output tokens for the budget), the way `bedrock.ts` does for Converse.
- **The setting:** `LLM_PROVIDER=anthropic`. The SDK reads the key from `ANTHROPIC_API_KEY`; never log or print it. `ANTHROPIC_MODEL_ID` overrides the model; the default is `claude-sonnet-5-5`, the same model as the Bedrock default. Reuse the capability table by model family.
- **Claude Sonnet 5.5 rules:**
  - no forced `tool_choice` (`any` or `tool` returns a 400, so use `auto` and name the tool in the prompt);
  - no temperature, and never `thinking: {type: "disabled"}` (both return a 400);
  - thinking is on by default, so in the tool loop append the assistant's whole `content` array unchanged, thinking blocks included, before the tool results.
- **Refusals:** check `stop_reason`. Turn on the server-side fallback (`client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`), and report a remaining `refusal` or `max_tokens` as an error, never as empty text. Retry on the SDK's typed errors (rate limit, connection, 5xx), not on message text.
- **Everywhere it is named:** the error message ("bedrock, anthropic or none"), the two "No language model is set up" messages, `apps/worker/.env.example`, `render.yaml` (`ANTHROPIC_API_KEY` as `sync: false`) and `docs/deploy.md`.

**Done when:**

- unit tests with a fake SDK client cover the mapping, the setting and a refusal;
- `pnpm llm:smoke` makes one tiny real call when `ANTHROPIC_API_KEY` is set (the owner adds it to `apps/worker/.env`), and skips otherwise;
- a live raise of Shifa shows Claude API calls in the LLM call log.

Commit as `feat(crew): env files and the claude api provider`.

---

## Phase 14: Make it true for every app (Prompts 81–84)

### 81. Certificates from the pipeline's own Soul [F]

Today no Graveyard app reaches a Rebirth Certificate from the Soul the pipeline learns.

- **Iqra and Barkat** differ on 50 of 50 proof cases.
- **Shifa** differs whenever two big bills use up the stock: the learned Soul has no "a quantity larger than the stock is refused" rule. This is also why `e2e/exorcism.spec.ts` is flaky, because its seed is the project id.

Write the spec first (`.kiro/specs/learned-certificates/`), then:

- **Refusal rules without a model.** When a typed number is refused (a message appears) and the same field is accepted lower, enumerate comparisons with the linked record or the same record (`line.qty <= medicine.qty`, `slip.tare < slip.gross`). Verify them against every observation like any other rule, and probe the boundary (`qty = stock + 1`, `tare = gross`).
- **Unworkable rules.**
  - Reject an effect rule the action cannot work out from what the owner types (the action's key macro) and the records that exist. Barkat's `party.balance = ledger.balance` copies one unknown into another.
  - The Surgeon's smoke test types only the macro's fields, like the Oracle.
  - A field the old app works out (NET, BALANCE) is never an input on the reborn app's form.
- **Prove what was published.** The Oracle proves only the actions the Surgeon published, and lists the others as "not reborn yet" instead of 50 failures.
- **A fixed proof seed for recorded runs,** so the demo and the e2e give the same answer every time.
- **Proof coverage:** no repeated cases (the 200-case CI proof had 3 bills 7 to 9 times each), and weight the cases towards actions with rules (98 of the 200 were "add customer", which has none).

**Done when:**

- without a model, a recorded raise of Shifa reaches a certificate after the owner's Fix on the Y2K ghost;
- Iqra's and Barkat's unfinished actions show "not reborn yet";
- with the model, all three reach one;
- `e2e/exorcism.spec.ts` passes 10 runs out of 10.

Commit as `fix(crew): certificates from the learned soul`.

### After 81: the checks that need the model

80a and 81 are merged; three of their "Done when" lines need a model key. Run them once the owner has put `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `apps/worker/.env` (never ask for the key in chat, never print or log it):

- `pnpm llm:smoke` answers;
- a live raise of Shifa shows Claude API calls in the "Show your work" call log, with their tokens, and no call ends on `max_tokens`;
- live raises of Iqra and Barkat with the model: which actions are reborn, the proof result, and the certificate or why there is none.

Report the results. Whatever is still missing goes into 82. No commit unless something had to change (then a `fix(crew): ...` with a test).

### 82. What the blind test found [F]

The holdout app in `kiroween-2026/holdout-kanta` (Fahad copies it to `samples/holdout/kanta`; its `HIDDEN-ANSWERS.md` stays out of the repo) has things our samples never had:

- "1. Item" menus;
- "Save? (Y/N)" prompts;
- labels with units ("Gross (kg):");
- fields that keep a refused value.

Fix, with a test for each:

- **Possessor:**
  - clear a field before typing (Home, then Backspace for its width), and again after a refusal;
  - never type a refused value twice;
  - take typical numbers from existing records of the same field, not 100 everywhere (so gross is more than tare);
  - answer Y to every "(Y/N)" save prompt it reaches.
- **Archaeologist:**
  - explain whole-number outputs too (`hypotheses.ts` skips any value without a decimal point; amounts in whole rupees are common), skipping only the fields the macro types;
  - read a linked record as it was at that observation (apply the earlier observations' changes), not as uploaded: a rate changed mid-day broke "RATE = the item's rate";
  - add `(a - b) * c`, `(a - b) / c`, `round(x, 0)` and thresholds with a non-zero else (FEE is 100 over 20,000 kg, else 50);
  - rules that belong to one action: a rule that fits every save of one action but not another's is kept for that action (an `actions` list on the rule in the Soul), not dropped, and the Vessel, the Surgeon, the workable check and the Oracle use it only there. Barkat needs it: KIND is "S" on a sale and "P" on a payment, BALANCE adds the amount on a sale and takes it off on a payment;
  - a field that every save of an action writes with the same value, and no key types, is that value (`ledger.kind = "S"`).
- **Refusals (what 81 left):**
  - every typed field, not only a bill line's: 81 reads line fields against the linked record only, so Barkat's limits and the holdout's tare are never seen;
  - against the same record too, as 81's spec says (`slip.tare < slip.gross`), and one sum (`party.balance + ledger.amount <= party.limit`, Barkat's credit limit);
  - a message is a refusal only when the save after it leaves the value out (a warning that still saves is not one);
  - the records start again at every boot: each séance and each stored probe starts from the data files, so mark the first step of each (81 marks only the probes it types in that same run, so a second raise of the same project reads them as one long day).
- **Screen reader:**
  - a label with a unit in brackets gets its label (allow `( ) % -` in `labelBefore`). This also labels Iqra's "Fee month (MMYYYY)", which changes 10 Iqra screen fingerprints, and takes FEE_MONTH off the list of what Iqra's "Add a payment" misses (the owner types it);
  - a box right after another field's value gets its own label (Shifa's `Code: PAN500   Qty:` leaves Qty unlabelled), and the focused field stays focused while the cursor blinks off; then remove the two stand-ins for these in `fieldOf` (`packages/crew/src/archaeologist/refusals.ts`);
  - re-record the three Graveyard runs (`pnpm pipeline:record`) and their fixtures in the same PR.
- **Séances on uploaded apps.** The studio says "later". When the Possessor is stuck, the owner shows it.
- **Score the holdout** in `pnpm score:archaeology`, next to the samples, and never tune on its answers.

**Done when:**

- a live raise of the holdout without a model saves slips by itself;
- it learns at least NET, RATE, FEE and the slip counter;
- its score is printed next to the samples';
- without a model, Barkat's two actions are reborn (no longer "not reborn yet") and proved: report the proof, a certificate is the goal;
- Shifa's recorded run still learns its stock rule and reaches its certificate after the Fix (`e2e/exorcism.spec.ts`).

Commit as `fix(crew): generality from the blind test`.

### 83. Certificate honesty, uploads and twin restarts [F]

- **Certificate:**
  - a proof run that issues a certificate runs every case, or the payload gets `reused` and the verify page shows it;
  - when phones synced before the migration, the certificate says "checked, not written";
  - it says which actions it covers: since 81 only the published actions are proved, so a certificate can cover part of an app. The payload lists the actions proved and those not reborn yet (with what each misses), and the verify page shows "covers 2 of 3 actions".
- **Security:**
  - the certificate carries an opaque reference instead of the project id (the id is the key to all of a project's data and every write);
  - `docs/security.md` says a project link is a secret.
- **Uploads:**
  - export an uploaded app from the Undertaker's records (today: 409);
  - keep deleted records, with their record numbers, in the migration.
- **Twin:**
  - a state file, so a restarted `afterlife-twin` sends the changes made while it was off, marked as a catch-up;
  - ship it as one file a shop PC can run (`npx afterlife-twin` or a packaged exe);
  - the tab shows the app's own folder.

**Done when:**

- a test covers each item;
- an uploaded app exports;
- a restarted capture sends what changed while it was off.

Commit as `fix: certificate honesty, uploads and twin restarts`.

### 84. Deploy for the judges [F]

Prompt 10, now for real. The rules require a working URL, free for judges, until **29 January 2027**.

- **Where:** the web on Vercel, the database on Neon, the API and worker on Render (`render.yaml`, worker on `standard`) or on one 2 GB VM (AWS Lightsail) with Docker Compose and Caddy for HTTPS.
- **Settings:** `CERT_SIGNING_KEY` and `CERT_PUBLIC_KEY` (`pnpm cert:key`), `LLM_PROVIDER` (`anthropic` with `ANTHROPIC_API_KEY` after 80a, or `bedrock` with AWS keys; else `none`), `WEB_ORIGINS`, `TRUST_PROXY`.
- **The demo:** the recorded runs as the demo cache, and a kill switch to recorded mode.
- **Monitoring:** an uptime check every 10 minutes (a Kiro Crew heartbeat).

**Done when:**

- `pnpm smoke:prod <url>` passes;
- a judge raises Shifa in recorded mode on a phone and opens its certificate;
- the URL is in the README.

Commit as `chore: deploy`.

---

## Phase 15: The apps people really run, and FBR's why-now (Prompts 85–88)

### 85. Every DBF dialect [F]

The market's apps are FoxPro and Visual FoxPro, not only dBASE III. In `@afterlife/dbf` (read, write, diff), the upload preview and the Undertaker, support:

- **Versions:**
  - dBASE III with memo (0x83, `.DBT`);
  - dBASE IV (0x8B, 0x43, 0xCB);
  - FoxBASE (0xFB);
  - FoxPro 2.x (0xF5, `.FPT` memos);
  - Visual FoxPro (0x30, 0x31 with autoincrement, 0x32 with varchar and varbinary), with its 263-byte backlink to the database container.
- **Visual FoxPro field types:** `I` integer, `Y` currency, `T` datetime, `B` double, `F`, `M`/`G` memo and general in the `.FPT`, `V`/`Q` varchar and varbinary, and the hidden `_NullFlags` field.
- **The code page byte** (437, 850, 1252, 1256) instead of assuming CP437.
- **Index files** (`.NTX`, `.IDX`, `.CDX`): recognised and ignored. Indexes are rebuilt, never read.
- **Optional extra, only if 85 to 88 are done early:** MS Access `.mdb` and `.accdb` tables through `mdb-reader` (MIT), read only, into the same table model, so a Visual Basic 6 and Access billing program can be raised from its data (Prompt 88). Many old Windows billing programs keep their data in Access, not DBF.

Follow Microsoft's "Table File Structure" and "Memo File Structure (.FPT)" pages for Visual FoxPro. Keep the writer byte-exact for every dialect it writes.

**Done when:**

- golden files of each dialect round-trip, and a property test checks `read(write(t))` equals `t` per dialect;
- the upload preview names the dialect;
- an uploaded Visual FoxPro table migrates and reconciles.

Commit as `feat(dbf): dialects`.

### 86. FBR digital invoice: the data [S]

**What FBR requires.**

- FBR's own FAQ: digital invoicing is mandatory for all corporate and non-corporate sales-tax-registered persons (SRO 709 of 22 April 2025).
- SRO 1413(I)/2025 of 1 August 2025 obliges all of them to integrate through a licensed integrator, with digital invoices by 1 December 2025.
- Each invoice is sent to FBR first and gets a unique 22-digit FBR invoice number, printed with a QR code.
- Old billing software whose source is gone cannot do this; the reborn app can.

Write the spec first (`.kiro/specs/fbr-invoice/`), then:

- **Read FBR's "Technical Documentation for DI API v1.12"** (fbr.gov.pk, Digital Invoicing, Technical Assistance). Map a saved Vessel bill to its invoice JSON:
  - the seller's NTN and STRN, the buyer (registered or not), the sale type;
  - each item with its HS code, quantity, rate, value without tax and sales tax (from the Soul's GST rule);
  - the totals.
- **A "Business details" form:** NTN, STRN, province, an HS code per item (a table), stored per project.
- **An `FbrClient` interface:**
  - the real client validates, then posts to FBR's sandbox when `FBR_DI_TOKEN` is set;
  - a fake client for tests and the demo, labelled "FBR sandbox (simulated)".
- **Offline:** an invoice waits in the phone's outbox, and its FBR number arrives with the sync.
- **The 72-hour rule** (Sales Tax General Order 01 of 2026): cancel or edit only within 72 hours, then only with the Commissioner's approval. The app says so.

**Done when:**

- a property test checks that every saved bill gives a valid invoice whose totals equal the bill's;
- the fake FBR returns a 22-digit number;
- a bill made offline gets its number after the sync.

Commit as `feat(vessel): fbr digital invoice`.

### 87. The reborn app, alive, and the FBR receipt [Q]

The reborn app (`/vessel/[projectId]`) still wears the Studio's graveyard theme. The people who use it have Windows 10 and 11 PCs at the counter and phone apps such as Easy Khata, so it should look like those: alive, plain and quick. The Studio keeps the haunted theme. Design reference: `docs/ui/afterlife-ui-update.html` (match its look and behaviour; do not copy its code).

- **A daylight theme, for the Vessel only:** add a `daylight` token set to `@afterlife/ui` (paper `#fbf8f2`, ink `#16201b`, accent `#0f766e`, warning `#8a5a0f`, error `#b4262c`), checked for AA contrast like the Haunted Ledger. Nothing in the Studio changes.
- **The old app's keys:** each action the Possessor learned keeps its key (Shifa: Enter adds an item, F3 edits the last quantity, F2 saves the bill, Esc cancels).
  - The key is printed on its button as a keycap, under the line "Same keys as the old program".
  - An app raised from data alone (Prompt 88) has no keys, so its buttons show none.
- **The rule beside the number:** when a Soul rule changes a total, its plain sentence shows under that line ("Over Rs 5,000, so 10% off. Learned from the old program.").
- **Counter and phone:**
  - on a PC, the bill fills the screen and the keyboard does everything;
  - on a phone, the owner sees today's sales, bills today, low stock, batches expiring this month and the last bill, all from the app's own data.
- **The receipt:** 80 mm print, PDF and "Send on WhatsApp" (the phone's share sheet with the PDF; on a PC, a `wa.me` link with the bill's text), with the FBR invoice number, its QR code and "FBR-ready (sandbox)" while it is not live.
  - Never draw FBR's own logo, and never claim a live integration.
  - In Urdu or English. The Prime Minister asked FBR for digital invoicing in Urdu (14 July 2025).
- **The why-now card:** in the Studio, on the Soul tab: "Your old program cannot issue FBR digital invoices. This one can, with your old rules."

**Done when:**

- an e2e test makes a Shifa bill with the keyboard alone (Enter, F3, F2), gets the simulated FBR number, and sees it and the QR code on the print preview and in the PDF, in English and in Urdu;
- an e2e test checks that `/raise` still uses the graveyard theme and `/vessel` uses daylight, and axe finds no serious violations in either;
- at 360 px the owner's view shows today's sales and the last bill with no sideways scrolling.

Commit as `feat(web): reborn app alive and fbr receipt`.

### 88. Raise an app you cannot run here [F]

Many shops run Visual FoxPro programs on Windows, which js-dos cannot run, but their data files are the same DBF tables. Add a project made from a data folder alone (no program file). Write the spec first (`.kiro/specs/raise-from-data/`), then:

- **Watch:** `afterlife-twin` watches the shop's real data folder for a few days. Its events become the Archaeologist's observations. There are no screens or keys: an inserted record is what was typed plus what the app worked out.
- **Learn:**
  - entities, keys, counters and rules come from those events;
  - actions come from the events' shapes (the twin's `candidateActions`, run the other way);
  - what the owner typed is told apart from what the app worked out, by fields that vary freely versus fields a rule explains.
- **Prove:**
  - the reborn app is published, and the proof is the Ghost Twin itself: every new real transaction is replayed and matched;
  - a "twin certificate" is issued after N days and M matches with 0 open mismatches (the readiness rule). Its payload says `proof: twin`.

**Done when:**

- with Shifa's recorded week (`samples/graveyard/shifa/twin-week.json`, 216 transactions) as the only input, the Archaeologist finds at least the rules it finds from possession;
- the reborn app is published;
- a twin certificate is issued and verifies on `/verify`.

Commit as `feat: raise from data`.

---

## Phase 16: Living Soul (Prompts 89–90)

### 89. Voice to a verified rule change [S]

Merges the old 81 and 82. Turn a spoken or typed request into a proposed Soul change:

- **The proposal:**
  - the model maps it to a rule edit in the DSL (add, modify or remove), with the affected screens and a plain English and Urdu summary;
  - it asks back when the request is ambiguous ("Senior citizen kaun hai? Age 60+?");
  - nothing is applied without the owner's approval.
- **After approval:**
  - a new Soul version;
  - the spec diff (the changed EARS lines);
  - property tests that the new rule holds, and that every unaffected rule still matches the old behaviour (a targeted differential run);
  - then publish to the Vessel, or roll back with the reason.
- **Speech:** Transcribe sends Urdu as Hindi. If `SPEECH_PROVIDER=azure` is set, add Azure Speech `ur-IN`, which gives real Urdu script.

**Done when:**

- a fake model handles 6 example requests, one of them ambiguous;
- a good change publishes;
- a breaking change rolls back with its explanation.

Commit as `feat(crew): voice to verified rule`.

### 90. Living Soul UI [Q]

The old 83:

- a big mic button ("Bol kar badlein / Speak to change") with a live transcript;
- the proposed change card (English and Urdu) and the spec diff (green and red EARS lines);
- the verification steps lighting up one by one, then "Live in your app";
- a history of all voice changes, with undo.

**Done when:** an e2e test uses an audio fixture to change the discount rule and sees the reborn app's bill total change.

Commit as `feat(web): living soul`.

---

## Phase 17: Studio polish (Prompts 91–93)

### 91. Landing page with the real pitch [Q]

Build `/`:

- **The hero:** a slowly flickering CRT showing Shifa, with the ghost cursor typing.
  - Headline: "Software that outlives its source code".
  - Subline: "No source code. No developer. Just the program and its data."
- **Who it is for, with sources** (from `docs/who-it-is-for.md`):
  - registered businesses whose billing software's developer is gone;
  - FBR's digital invoicing why-now (SRO 709 and SRO 1413 of 2025);
  - about 5,300 companies still on Visual FoxPro (Enlyft);
  - said plainly: nobody runs DOS at a shop counter now (Windows 11 and 10 are 99.7% of Pakistani desktops, StatCounter, October 2026). DOS is our hardest demo; the market is old Windows billing programs (FoxPro, Visual Basic 6, Access) whose maker is gone.
- **The story:** 6 steps (Possess, Exhume, Soul, Rebirth, Proof, Afterlife), each with a tiny looping animation that means something.
- **"Tested on an app it had never seen":** the holdout's honest score.
- **A Kiro section:** specs, hooks, steering, MCP, Crew, the power.
- **Buttons:** "Raise a dead app" and "How it works".

**Done when:**

- Lighthouse scores 90+ for performance and accessibility on mobile;
- an e2e test clicks both buttons.

Commit as `feat(web): landing`.

### 92. Judge Playground [Q]

Build `/playground`, a guided 5-minute path with no login:

1. pick an app;
2. watch possession (it can be sped up);
3. see the rules, in the owner's words;
4. run the proof;
5. exorcise one ghost;
6. get the certificate on a phone (QR);
7. print a bill with its FBR-ready number.

Add a step indicator with "what is happening and why" notes, and a clearly labelled "skip ahead (recorded)".

**Done when:** Playwright completes the whole playground in under 5 minutes against production.

Commit as `feat(web): judge playground`.

### 93. The raise page as one story, with motion and sound [Q]

Merges the old 86 and 88. The design reference `docs/ui/afterlife-ui-update.html` plays all seven moments; match its order and timing, not its code. One effect per step, and each one means something:

| Moment            | Effect                                                                                                                                                                | What it means                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Raise and possess | The tombstone cracks, then the CRT powers on (a line that opens to the full screen). Each key the ghost presses shows as a keycap; each DBF write slides into a list. | The old app boots and is watched    |
| Soul              | Each rule rises out of the fog as one plain sentence, with the field it came from.                                                                                    | A rule exhumed                      |
| Proof             | Both apps type the same bill in step and the counters roll. A difference pulses red, shrinks to the smallest bill, and the run starts again.                          | The proof is live                   |
| Exorcism          | A ghost floats on each bug card. Fix dissolves it into particles; Keep marks it kept.                                                                                 | A bug exorcised, or kept on purpose |
| Certificate       | "Died {year} · Reborn 2026", four big numbers, and a wax seal that stamps when the browser check passes.                                                              | The signature is valid              |
| Ghost Twin        | A candle lights for each day of real bills that matched.                                                                                                              | Real use agrees                     |
| Switch-over       | The CRT shrinks to a dot while the phone lights up in the daylight theme (Prompt 87).                                                                                 | The handover                        |

- **Layout:**
  - the tabs come first on phones, and finished steps collapse;
  - each tab has one plain sentence under its title, and the rest goes behind "Show more".
- **Everywhere:** page transitions (View Transitions) and skeletons in place of "Opening...".
- **Words judges will read:**
  - rule sentences in the owner's words ("GST: 17% of the bill after the discount, rounded down to the paisa"), with the expression underneath. Today they read like code: "The bill gst is `trunc((bill.subtotal - bill.discount) * 0.17, 2)`";
  - when the differences are a ghost the Exorcist found, the Proof tab links to the Exorcism tab instead of only "No Rebirth Certificate yet: 6 cases differ";
  - after the switch-over, the Ghost Twin intro no longer says "The shop keeps using the old app";
  - `/playground` and `/verify/[id]` get their own page titles (today both are only "Afterlife").
- **Sound:** optional and off by default (our own generated sounds).
- **Reduced motion is respected everywhere:** each effect shows its end state at once.
- **Refreshing mid-run restores the exact state.**

**Done when:**

- an e2e test refreshes mid-run and sees the same state;
- sound is off by default, and the toggle persists;
- with reduced motion on (`reducedMotion: 'reduce'`), every step shows its end state.

Commit as `feat(web): raise story and motion`.

---

## Phase 18: Kiro breadth (Prompt 94)

### 94. The Kiro power, custom agents and the evidence [S]

The judges score "a variety of Kiro tools used impactfully".

- **The power:** package `powers/afterlife` as a Kiro power:
  - the `afterlife-emulator` MCP config;
  - steering for "how to resurrect a legacy app";
  - a hook that proves again on save;
  - spec templates and a quick start.
  - A fresh Kiro project raises a DOS app from chat.
- **Custom agents:** add at least one in `.kiro/agents/`, for example a proof reviewer that reads a proof run and explains each difference.
- **A 5th hook.**
- **Kiro CLI and Kiro Web:** one real use each, recorded.
- **`docs/kiro-usage.md`:**
  - the Specs section (one paragraph per spec);
  - the Crew section (the nightly job's first result and screenshot);
  - "Where Kiro surprised us".

**Done when:**

- the power installs in a fresh project (recorded as a GIF);
- the agent and the hook run;
- every section of `docs/kiro-usage.md` has real evidence.

Commit as `feat(power): afterlife and kiro evidence`.

---

## Phase 19: Hardening (Prompts 95–97)

### 95. Golden e2e and the demo cache, with the model [F]

Merges the old 94 and 97.

- **Re-record all three Graveyard apps** with the model once a provider works (80a, or Bedrock), with fixed proof seeds. Do not re-record the holdout: it is never tuned for.
- **The golden e2e** `e2e/full-rebirth.spec.ts`:
  1. raise Shifa;
  2. possession;
  3. the rules;
  4. rebirth;
  5. migrate;
  6. proof;
  7. exorcise one;
  8. the certificate verifies;
  9. an offline bill with its FBR-ready number;
  10. a voice change;
  11. a twin day.
- **The demo cache:** `pnpm seed:demo` loads it. Every recorded run says "recorded run" in the UI.
- **A second blind holdout** (another domain, written by someone who did not change the Possessor), scored once.

**Done when:**

- the golden e2e is green 3 times in a row against production;
- a fresh database plus `seed:demo` gives a working playground.

Commit as `test: golden e2e and demo cache`.

### 96. Security and observability [F]

Merges the old 95 and 96.

- **Uploads:** zip-slip, sizes, the virus scan.
- **The emulator:** browser and headless sandbox only.
- **Inputs:** zod on every route; rate limits; CORS locked to our domains.
- **Secrets:** only in env; the signing key is never logged.
- **Dependencies:** `pnpm audit`.
- **The project id:** see 83.
- **Observability:**
  - structured logs with the project and the step;
  - a `/status` page with the queue depth and the pool use;
  - graceful worker shutdown;
  - a kill switch to recorded mode if the model's quota runs out during judging.
- **`SECURITY.md`.**

**Done when:**

- the security tests pass (a malicious zip, an oversized file, injection strings in DSL inputs);
- the kill switch makes the playground run fully from the cache.

Commit as `chore: security and observability`.

### 97. Accessibility, Urdu RTL and phones [Q]

Merges the old 89 and 90:

- keyboard navigation everywhere;
- visible focus rings;
- live regions for the counters;
- AA contrast;
- Urdu right to left with Nastaliq and the right line height, on every page including the FBR receipt and `/verify`;
- 360x740 with a throttled CPU and network;
- js-dos and React Flow loaded lazily;
- the reborn app's first JS under 200 KB gzip.

**Done when:**

- there are no serious axe violations on any route, in English and Urdu;
- the bundle check fails over budget;
- the mobile e2e tests pass.

Commit as `feat(web): a11y, rtl and phones`.

---

## Phase 20: Submission (Prompts 98–100)

### 98. Kiro usage write-up and README [S+F+Q]

Write `docs/kiro-usage.md` and the README section "How we used Kiro", answering every question in the Kiroween brief with real examples and screenshots:

- IDE, CLI, Web and Crew;
- custom agents;
- each hook;
- the specs, compared with vibe coding;
- the steering that mattered most;
- MCP (Kiro driving a 1998 app);
- the property-based-testing bugs caught (real ones from the git history);
- the power.

Add to the README:

- "Who it is for", with the sources from `docs/who-it-is-for.md`;
- the honest limits, for example "without a model, these rules are not found", and the holdout's score;
- which Soul the 200-case proof uses: today "200 cases, 0 differences" is the reference Soul (`SHIFA_AS_IT_RUNS_SOUL`), not the one the Archaeologist learns;
- the sample disclosure: "sample apps written by our team to simulate 1990s software";
- test instructions for judges.

**Done when:** a teammate who did not write it can follow the README from zero.

Commit as `docs: kiro usage and readme`.

### 99. Demo video [Q]

3 minutes or less, real product footage only, English voice with Urdu subtitles where the owner speaks, our own music. The story:

- **The why-now (15 s):** "A Lahore distributor's billing software was written in 2001. The developer is gone. FBR now wants a 22-digit number on every invoice."
- **Possession and the rules,** in the owner's words.
- **The proof,** with the counterexample.
- **The Exorcism.**
- **The certificate,** scanned on a phone.
- **The FBR-ready receipt.**
- **Ghost Twin and the switch-over.**
- **The 9 PM Crew summary** on the owner's phone.
- **"Tested on an app it had never seen" (10 s).**
- **The Kiro montage.**
- **End on:** "Software that outlives its source code."

**Done when:**

- the video is under 2:59;
- a teammate checks every claim against the live product;
- the link is in the README.

Commit as `docs: demo video link`.

### 100. Final submission checklist [F]

Before submitting, check each item and tick it in `docs/submission-checklist.md`:

1. The repo is public, the MIT license shows in the About section, and `.kiro/` is committed.
2. The live URL works logged out, the playground completes in under 5 minutes, and it stays up until 29 January 2027.
3. `pnpm ci:local` is green, and the nightly Crew job is green.
4. The video is public on YouTube and under 3:00.
5. Every FBR claim says "FBR-ready (sandbox)" and no FBR logo is used. Every market figure has its source.
6. The Devpost text has:
   - the category: Resurrection;
   - the bonus prizes: Startup (LinkedIn and the Matrix AE website), the Kiro Crew repo link, Ghost of Kiroween Past, the blog URL, the social post URL;
   - the Kiro write-up;
   - the test instructions.
7. Every team member is added to the Devpost project.
8. The README is refreshed as of Prompt 100, as at every 20 prompts: the counts, the coverage table, the Status (what 81 to 100 delivered), what works and what does not yet, and Next (Phase 21).

Submit on **3 December**, tag the submitted commit `kiroween-submission` and push the tag, take screenshots of the confirmation, and keep the production stack running until 29 January 2027 (the end of judging).

**Done when:** submitted.

Commit as `chore: submission`.

---

## Phase 21: After the hackathon (Prompts 101–104)

Start these only after judging ends on 29 January 2027. Until then the live URL runs the submitted commit (the `kiroween-submission` tag), and new work stays on branches that are not deployed there.

### 101. Owner accounts [F]

Today the project link is the key (Prompt 83 says so in `docs/security.md`).

- Owner sign-in with an emailed one-time code, and an owner key per project for `afterlife-twin`.
- Roles in the reborn app: the owner, and a cashier who can bill but cannot Keep, Fix or switch over.
- The certificate's opaque reference stays shareable.

**Done when:** every write needs the owner's session or key, and the security tests cover each route for each role.

Commit as `feat: owner accounts`.

### 102. FBR live, through a licensed integrator [S]

- Swap the simulated `FbrClient` for the real one through a licensed integrator (PRAL integrates free of cost), with the production credentials only in the server's secret store.
- The receipt drops "(sandbox)" only for an invoice FBR has confirmed.

**Done when:** a test business in FBR's sandbox, then one pilot shop, issues a real 22-digit invoice, and the 72-hour edit rule holds.

Commit as `feat(vessel): fbr live`.

### 103. Visual Basic 6, Access and SQL Server apps [F]

If the optional extra in 85 was not done: read `.mdb` and `.accdb` files with `mdb-reader`, then SQL Server databases (common under Visual Basic 6 programs), into the same table model, so these apps raise from their data (Prompt 88).

**Done when:** an Access billing sample raises from a recorded week and gets a twin certificate.

Commit as `feat(dbf): access and sql server`.

### 104. Ready for a pilot in a real shop [Q]

- `afterlife-twin` as a one-click Windows installer that starts with the PC.
- An owner consent page in English and Urdu, and a support export with customer names removed.
- `docs/pilot.md`: the runbook (install, two weeks of twin, the switch-over, rolling back) and what to record (what broke, the time each step took, what the owner said).

**Done when:** a teammate installs it on a clean Windows 11 PC from the runbook alone, and a recorded week matches.

Commit as `feat(twin): pilot ready`.
