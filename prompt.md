# Afterlife: 100 Kiro Prompts

How to use this file:
- **Run the prompts in order, inside Kiro IDE.** Paste each one into Kiro chat. For the bigger features, use **Spec mode**, so Kiro creates `requirements.md`, `design.md` and `tasks.md` under `.kiro/specs/`.
- **Owner tags:** **[F]** Fahad, **[S]** Sheheryar, **[Q]** Farquleet.
- **The loop for every prompt (Rule 2 in plan.md):** write tests (Vitest + fast-check) → make them pass → wire into the UI → Playwright e2e → `pnpm verify` green → Conventional Commit → push the branch, open a PR, CI green → merge.
- **Prompt 0 is the master context.** Paste it at the start of every new Kiro session.

---

## Prompt 0: Master context (paste at the start of every session)
> We are building **Afterlife**, a Kiroween 2026 Resurrection entry: it brings dead DOS business software (Clipper/dBase/FoxPro era) back to life without source code. The product drives the old app in js-dos, learns rules from .DBF data diffs, writes a typed "Soul" IR plus a Kiro spec, runs it in a "Vessel" runtime as an offline-first PWA, and proves equivalence with differential property-based tests.
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
For each finding, the owner chooses **Keep old behaviour** (the Vessel copies it exactly, and the proof stays strict) or **Fix** (the Vessel uses the corrected rule, and the Oracle records it as an *accepted divergence* that's listed on the certificate). A fixed rule creates a new Soul version and re-runs the affected proof cases only.
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

## Phase 13: Living Soul (Prompts 80–83)

### 80. Speech client [S]
In `packages/crew`, add a `SpeechClient` interface with an Amazon Transcribe implementation (Urdu + English, streaming or batch) and a fallback provider, recording audio in the browser with MediaRecorder (webm/opus). Normalise the transcript (numbers in Urdu words → digits, "percent" variants).
**Done when:** these tests pass:
- unit tests for the normaliser (for example "paanch feesad" → 5%)
- a fake speech client test

Commit as `feat(crew): speech`.

### 81. Voice to rule change [S]
Turn a spoken request into a proposed Soul change: the LLM maps the request to a rule edit in the DSL (add, modify or remove), with the affected screens and a plain English + Urdu summary. Ask clarifying questions back in the UI if it's ambiguous ("Senior citizen kaun hai? Age 60+?"). Never apply the change without the owner's approval.
**Done when:** tests with a fake LLM cover 6 example requests, including an ambiguous one. Commit as `feat(crew): voice to rule`.

### 82. Change verification loop [S]
After approval:
1. create a new Soul version
2. regenerate the Kiro spec diff (show the changed EARS lines)
3. run property tests that the new rule holds **and** that every unaffected rule still matches the old behaviour (a targeted differential run)
4. publish to the Vessel

Roll back automatically if any check fails.
**Done when:** these tests pass:
- a good change publishes
- a breaking change rolls back with an explanation

Commit as `feat: living soul verification`.

### 83. Living Soul UI [Q]
Build the "Living Soul" tab:
- a big mic button ("Bol kar badlein / Speak to change"), with a live transcript
- the proposed change card (English + Urdu), the spec diff (green/red EARS lines)
- the verification steps lighting up one by one, then "Live in your app ✓"
- a history of all voice changes with undo

**Done when:** an e2e test uses an uploaded audio fixture to change the discount rule and sees the Vessel bill total change. Commit as `feat(web): living soul`.

---

## Phase 14: Studio polish and haunted design (Prompts 84–90)

### 84. Landing page [Q]
Build `/`:
- **hero:** a slowly flickering CRT showing the Shifa app, with the headline "Software that outlives its source code" and the subline "No source code. No developer. Just the .exe."
- **CTAs:** "Raise a dead app" (→ /playground) and "How it works"
- **then:** a 6-step story (Possess, Exhume, Soul, Rebirth, Proof, Afterlife), each step with a tiny looping animation
- **then:** the Pakistan story section, and a Kiro section ("Built with Kiro: specs, hooks, Crew, PBT, MCP, powers")

**Done when:** a Lighthouse CI score of 90+ for performance and accessibility on mobile, and an e2e test of the CTAs. Commit as `feat(web): landing`.

### 85. Judge Playground [Q]
Build `/playground`, a guided 5-minute flow with no login:
1. pick a dead app
2. watch possession (it can be sped up)
3. see the rules
4. run a 100-case proof
5. exorcise one bug
6. get the certificate

Add a step indicator with "what is happening and why" tooltips, and a "skip ahead (demo cache)" option that's clearly labelled.
**Done when:** a Playwright test completes the full playground in under 5 minutes against production. Commit as `feat(web): judge playground`.

### 86. Raise page orchestration [Q]
Make `/raise/[id]` feel like one continuous story: the tabs unlock in order as pipeline steps complete, with a sticky progress spine on the left (tombstone → candle → soul → phoenix), and toasts for key moments. Make sure that refreshing the page restores the exact state from the event replay.
**Done when:** an e2e test refreshes mid-run and the state is restored. Commit as `feat(web): raise orchestration`.

### 87. "Show your work" panel [S]
Add a drawer, available on every tab, that shows the Crew's reasoning trail: which agent ran, the prompts summary, the tool calls (MCP/emulator actions), the tokens used, and the time taken, from the logs saved in Prompt 47. This shows judges the agent system is real.
**Done when:** an e2e test opens the drawer and sees entries for each agent that ran. Commit as `feat(web): show your work`.

### 88. Sound and motion polish [Q]
Add optional, off-by-default spooky sound design (our own generated sounds only, with no copyrighted audio): a soft CRT hum, key clicks during possession, a candle light chime on each rule found, and a bell when the certificate is issued. Unify the Framer Motion timings (`fast` 150ms, `base` 300ms, `slow` 600ms) and respect reduced motion everywhere.
**Done when:** an e2e test checks sound is off by default and that the toggle persists. Commit as `feat(web): sound and motion`.

### 89. Accessibility and Urdu RTL [Q]
Full accessibility pass:
- keyboard navigation everywhere, focus rings visible on the dark theme, ARIA live regions for the counters
- contrast AA on all tokens
- Urdu mode switches to RTL with the Noto Nastaliq font and correct line height

Run axe on every page in Playwright.
**Done when:** there are zero serious axe violations on all routes, in both English and Urdu. Commit as `feat(web): a11y and rtl`.

### 90. Mobile and low-end device pass [Q]
Test the Vessel and the playground at 360x740 and on a throttled CPU (4x) and network (slow 4G) in Playwright. Lazy-load js-dos and React Flow, code-split the tabs, and keep the Vessel initial JS under 200 KB gzip.
**Done when:** a bundle size check in CI fails if it's over budget, and the mobile e2e tests pass. Commit as `perf: mobile budget`.

---

## Phase 15: Kiro power and registry (Prompts 91–93)

### 91. Afterlife Kiro power [S]
Package `powers/afterlife` as a Kiro power (in the format confirmed in Prompt 2). It bundles:
- the `afterlife-emulator` MCP server config
- steering docs for "how to resurrect a legacy app"
- hooks (re-run equivalence on save)
- spec templates for legacy rebuilds
- a quick start

A developer installs it in a fresh Kiro project and can raise a DOS app from Kiro chat.
**Done when:** a fresh-project install is tested manually and recorded as a GIF, and a README section explains it. Commit as `feat(power): afterlife`.

### 92. Haunted Registry [S]
After each successful rebirth, extract reusable patterns (for example "pharmacy billing with GST and expiry block", "school fees with sibling discount") as anonymised Soul fragments, stored in `registry_patterns`. The Archaeologist proposes matching patterns as starting hypotheses for new apps, which makes the next rebirth faster.
**Done when:** a test shows that raising Shifa a second time with the registry needs fewer LLM calls (measured). Commit as `feat: haunted registry`.

### 93. Registry page [Q]
Build `/registry`: cards of the known patterns, with the app type, the rules count and "used in N rebirths", plus a search. Each pattern shows its rules in English and Urdu. It's linked from the landing page and the Soul tab ("matched pattern: Pharmacy GST").
**Done when:** an e2e test searches "pharmacy" and opens a pattern. Commit as `feat(web): registry page`.

---

## Phase 16: Hardening and demo (Prompts 94–97)

### 94. Full end-to-end suite [F]
Write the golden e2e test `e2e/full-rebirth.spec.ts`:
1. graveyard
2. raise Shifa
3. possession
4. rules
5. rebirth
6. migrate
7. a 100-case proof
8. exorcise 1
9. certificate verify
10. Vessel bill offline
11. voice change
12. twin day

It runs nightly against production and on every merge to `main` (in demo cache mode for speed).
**Done when:** it's green 3 nights in a row. Commit as `test: golden e2e`.

### 95. Security review [F]
Review and fix:
- **uploads:** zip-slip, size limits, MIME allow-list, ClamAV
- **sandbox:** the emulator runs only in the browser/headless sandbox, with no host execution
- **inputs:** zod validation on every route, rate limits, and CORS locked to our domains
- **secrets:** only in env; the Ed25519 private key is never logged
- **dependencies:** `pnpm audit`

Write `SECURITY.md`.
**Done when:** a security test suite (malicious zip, oversized file, injection strings in DSL inputs) passes. Commit as `chore: security hardening`.

### 96. Observability and reliability [F]
Add structured logs (pino) with a project id and step, error tracking (Sentry, free tier) on the web, API and worker, a `/status` page showing the queue depth and pool usage, and graceful worker shutdown. Add a "kill switch" env var that forces demo cache mode if the Bedrock quota runs out during judging.
**Done when:** tests check the kill switch makes the playground run fully from the cache. Commit as `chore: observability`.

### 97. Demo cache and seed data [S]
Run the full real pipeline on all 3 samples, save the outputs (observations, Soul versions, proof cases, certificates) as a versioned demo cache, and load it with `pnpm seed:demo`. Label demo-cache content in the UI with a small "recorded run" chip, for honesty.
**Done when:** a test checks that a fresh database plus `seed:demo` gives a working playground. Commit as `chore: demo cache`.

---

## Phase 17: Submission (Prompts 98–100)

### 98. Kiro usage write-up and README [S+F+Q]
Write `docs/kiro-usage.md` and the README section "How we used Kiro", answering every question in the Kiroween brief with real examples and screenshots:
- IDE vs CLI vs Crew
- custom agents
- each hook and what it automated
- how the specs were structured and how that compared with vibe coding
- the steering strategy that mattered most (the testing rule)
- MCP (Kiro driving a 1998 app)
- the PBT bugs caught (list real ones from our git history)
- the Afterlife power

Link to the `.kiro/` files. Add the architecture diagram, the samples disclosure ("sample apps written by our team to simulate 1990s software"), and the test instructions for judges.
**Done when:** a teammate who didn't write it can follow the README from zero. Commit as `docs: kiro usage and readme`.

### 99. Demo video [Q]
Produce the 3-minute video from the demo story in plan.md section 7.
- **Footage:** 1920x1080 screen recordings of the real product (no mockups), plus the real shop footage if available.
- **Audio:** a voiceover in English with Urdu subtitles where the owner speaks, and our own generated music only (no copyrighted audio).
- **Endings:** finish with the Kiro features montage and the line "Software that outlives its source code." Upload it to YouTube as public.

**Done when:** it's under 2:59, a teammate checks every claim matches the live product, and the link is added to the README. Commit as `docs: demo video link`.

### 100. Final submission checklist [F]
Before submitting, verify each item and tick it in `docs/submission-checklist.md`:
1. The repo is public, the MIT license shows in the About section, and `.kiro/` is committed and not ignored.
2. The live URL works logged out, and the playground completes in under 5 minutes.
3. CI is green.
4. The video is public and under 3:00.
5. The Devpost text has the category Resurrection, the bonus prizes (Startup with LinkedIn + matrix-ae website, Kiro Crew repo link, blog URL, social URL), the Kiro write-up and the test instructions.
6. Every team member is added to the Devpost project.

Submit on **Dec 3**, take screenshots of the confirmation, and keep the production stack running until Jan 29, 2027 (the end of judging).
**Done when:** submitted. Commit as `chore: submission`.
