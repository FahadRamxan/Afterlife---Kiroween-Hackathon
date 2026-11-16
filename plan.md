# Afterlife: Build Plan (Kiroween 2026)

> Software that outlives its source code.
> Afterlife brings dead business software back to life without the source code. It drives the old app inside an emulator, learns its rules by watching how its data changes, writes a Kiro spec (the app's "soul"), rebuilds it as a modern offline-first app, and proves the new app behaves exactly like the old one.

- **Category:** Resurrection
- **Bonus targets:** Best Startup (Matrix AE), Best Kiro Crew App, Best Demo, Blog, Social Blitz
- **Deadline:** Fri Dec 4, 2026, 2:00 PM PT = **Sat Dec 5, 3:00 AM PKT**. Internal deadline: **Dec 3, 11:59 PM PKT**.
- **Team:** Fahad Ramzan, Sheheryar Ramzan, Farquleet Farhat Gondal
- **Prompts:** every build step is in [prompt.md](prompt.md) (100 prompts, in order)

---

## 1. Golden rules (non-negotiable)

### Rule 1: Build with Kiro
- All product code is written inside **Kiro IDE**: specs, agent hooks, steering, custom agents, MCP and powers.
- The `.kiro/` folder is committed from the first commit and never put in `.gitignore`.
- Claude helps only with research, planning and writing. Code written outside Kiro weakens the submission and risks disqualification for "insufficient use of Kiro".

**Which Kiro to use:**
- **Kiro IDE (main tool):** everyone writes all the product code here, using specs, hooks, steering, PBT and MCP.
- **Kiro Crew (second tool, from week 2):** runs the Kiro CLI agents for long, unattended work, and reads the same `.kiro` folder. We use it for:
  1. nightly jobs: long PBT runs, archaeology scoring, and fixing failing tests on a branch
  2. a separate public repo, `afterlife-crew`: a **Kiro Crew App** (built with the Crew App SDK) that runs Ghost Twin as a scheduled job and sends the shop owner a daily Telegram summary. It targets the Best Kiro Crew App bonus. Owner: Sheheryar.
- **Kiro CLI:** comes with Crew, and is used in scripts where useful.

Write up how they differed in `docs/kiro-usage.md`, because judges ask about this.

### Rule 2: Test, wire, test, commit, push
Every feature follows this loop. No exceptions.

| Step | What | Tool |
|---|---|---|
| 1. **Test first** | Write unit tests and property-based tests for the logic *before* or together with the code | Vitest + fast-check |
| 2. **Make it pass** | Implement until all tests are green | `pnpm test` |
| 3. **Wire into UI** | Connect the feature to a real screen in the app (no hidden features) | Next.js |
| 4. **Test the UI** | Write or extend a Playwright end-to-end test that clicks through the feature | Playwright |
| 5. **Commit** | Only if `pnpm test && pnpm e2e && pnpm lint && pnpm typecheck` all pass. Conventional Commit message (`feat(oracle): ...`) | Git + Husky pre-commit hook |
| 6. **Push** | Push to a feature branch, open a PR, CI must be green, then merge to `main` | GitHub + GitHub Actions |

This rule is enforced in three places:
1. **Steering doc:** `.kiro/steering/testing-rule.md`, so Kiro follows it on every task.
2. **Kiro hooks:** run tests on save, and a "pre-commit check" hook.
3. **Husky pre-commit and GitHub Actions CI:** a red test means nothing merges.

### Rule 3: One perfect flow
Pharmacy billing and stock, end to end, is flawless before anything else is started.

### Rule 4: Everything visible
Every feature appears in the UI and in the demo video. If judges can't see it, it doesn't count.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere (Node 22 LTS) | One language, shared types, fast-check PBT |
| Monorepo | **pnpm workspaces + Turborepo** | Shared packages, cached builds |
| Web app (Studio, Graveyard, Playground, Verify) | **Next.js 15 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui + Framer Motion** | Fast, polished UI |
| Reborn app (Vessel) | Next.js route + **PWA (Serwist)** + **Dexie (IndexedDB)** for offline | Works on cheap Android phones during power cuts |
| API | **Fastify 5** + **zod** + WebSockets (`@fastify/websocket`) | Typed, fast, live progress streaming |
| Jobs / worker | **pg-boss** (queue on Postgres) | No Redis needed |
| Database | **PostgreSQL 16** (Neon in prod, Docker locally) + **Drizzle ORM** | Simple and typed |
| Emulator | **js-dos v8** (DOSBox in WebAssembly), in the browser and in headless **Playwright Chromium** on the worker | Judges can run the old app in a tab |
| Screen reading | Custom **80x25 text-mode decoder** (VGA 8x16 glyph template matching) | Exact, no OCR errors |
| Old data files | Custom **dBASE III / FoxPro .DBF** reader, writer and differ | Core of rule learning |
| AI | **Amazon Bedrock** (Claude Sonnet as default model, behind a `LlmClient` interface) | AWS sponsor alignment |
| Speech (Living Soul) | **Amazon Transcribe** (Urdu and English) behind a `SpeechClient` interface, with a fallback provider | Owner speaks Urdu |
| Property-based tests | **fast-check** + **Vitest** | Differential equivalence proof |
| End-to-end tests | **Playwright** | UI verified before every commit |
| Certificate | **Ed25519** via `@noble/ed25519` + RFC 8785 JSON canonicalization | Verifiable rebirth certificate |
| MCP | **@modelcontextprotocol/sdk** (TypeScript): custom `afterlife-emulator` MCP server | Kiro itself can drive the emulator while developing |
| Sample dead apps | **C with Open Watcom (DOS target)** writing real .DBF files | Our own realistic 1990s apps (disclosed) |
| Hosting | **Vercel** (web) + **Render** (API + worker) + **Neon** (Postgres) | Free or cheap, public URLs for judges |
| CI | **GitHub Actions**: lint, typecheck, unit, PBT, e2e | Rule 2 enforcement |
| License | **MIT** (visible in the GitHub About section) | Required |

---

## 3. Architecture

```
            ┌────────────────────────── apps/web (Next.js) ───────────────────────────┐
            │ Graveyard | Possession Theater | Soul Viewer | Proof Run | Ghost Twin    │
            │ Living Soul (voice) | Rebirth Certificate | Judge Playground | Vessel PWA│
            └───────────────▲───────────────────────────────▲──────────────────────────┘
                            │ REST + WebSocket              │ runs reborn app offline
                    ┌───────┴────────┐               ┌──────┴──────┐
                    │ apps/api       │──pg-boss────▶ │ apps/worker │  Crew runtime
                    │ Fastify        │               │ (Playwright │  + headless js-dos
                    └───────┬────────┘               │  + Bedrock) │
                            │ Drizzle                └──────┬──────┘
                       PostgreSQL ◀─────────────────────────┘
packages/: soul (IR + spec writer) · vessel (runtime) · dbf · screen · emulator
           oracle (PBT) · crew (agents) · certificate · mcp-emulator · ui (design system)
powers/afterlife (Kiro power) · samples/graveyard (3 dead DOS apps)
```

### The Crew (product agents)
| Agent | Job |
|---|---|
| **Possessor** | Drives the old app's keyboard, explores every screen, records a screen graph |
| **Archaeologist** | Diffs the DBF files after each action, infers business rules, writes the Soul (IR + Kiro spec) |
| **Surgeon** | Compiles the Soul into the Vessel (reborn app) |
| **Undertaker** | Migrates the old data and checks every total |
| **Oracle** | Differential property-based testing, old vs new, and issues the certificate |
| **Exorcist** | Finds old bugs and security flaws; the owner decides whether to keep or fix each one |

### Core idea for reliability
The reborn app is **not free-form AI-generated code**. The Soul is a typed IR (entities, fields, screens, rules as small expressions). The Vessel is a runtime that executes it. This makes the proof possible, makes Living Soul edits safe, and still exports a full Kiro spec plus a code scaffold for developers.

---

## 4. Repo layout

```
afterlife/
├── .kiro/
│   ├── steering/   product.md, tech.md, structure.md, testing-rule.md, design-system.md, crew.md
│   ├── specs/      one folder per feature (requirements.md, design.md, tasks.md)
│   ├── hooks/      test-on-save, pbt-on-oracle-change, pre-commit-check, spec-sync, a11y-check
│   ├── agents/     custom Kiro agents used during development
│   └── settings/mcp.json
├── apps/       web, api, worker
├── packages/   soul, vessel, dbf, screen, emulator, oracle, crew, certificate, mcp-emulator, ui
├── powers/afterlife/
├── samples/graveyard/   shifa-pharmacy, iqra-school-fees, barkat-kiryana
├── e2e/        Playwright tests
├── docs/       kiro-usage.md, architecture.md, demo-script.md
├── LICENSE (MIT), README.md
```

---

## 5. Owners

| Person | Owns | Modules |
|---|---|---|
| **Fahad** | Backend, data, proof | Repo/CI, dbf, emulator, MCP, API/worker/DB, Undertaker, Oracle, certificate, Ghost Twin, deploy |
| **Sheheryar** | AI and agents | screen decoder, crew runtime, Possessor, Archaeologist, Soul IR and spec writer, Exorcist, Living Soul, Kiro power |
| **Farquleet** | Frontend, design, story | design system, all Studio screens, Vessel PWA, Judge Playground, sample app UIs, video, blog, social |

**Shared:**
- the sample dead apps (all three)
- finding a real shop (Fahad leads)
- Kiro usage write-up (each person writes their part)

---

## 6. Timeline (Nov 16 to Dec 4)

| Dates | Milestone | Prompts | Exit test |
|---|---|---|---|
| **Nov 16–17** | Foundation: repo, `.kiro`, CI, design system, deploy skeleton | 1–10 | Empty app deployed, CI green, hooks firing |
| **Nov 17–19** | Graveyard: 3 sample DOS apps + DBF + screen packages | 11–25 | Sample app runs in a browser tab; DBF diff works |
| **Nov 19–21** | Emulator control, MCP, API, worker, DB | 26–40 | Worker can drive the old app headless and stream its screen to the UI |
| **Nov 21–24** | Soul IR, Possessor, Archaeologist | 41–57 | Pharmacy app explored automatically; rules inferred; Kiro spec generated |
| **Nov 24–26** | Vessel, Undertaker, Oracle, certificate | 58–72 | Reborn pharmacy app works offline; proof run passes; certificate verifies |
| **Nov 26–28** | Exorcist, Ghost Twin, Living Soul | 73–83 | Bugs listed; shadow mode replays; voice rule change reverified |
| **Nov 28–30** | Studio polish, haunted design, playground, power, registry | 84–93 | Full demo flow done by a stranger in under 5 minutes |
| **Dec 1–2** | Hardening, demo mode, real-shop footage, video | 94–99 | All e2e green on production URL; video under 3:00 |
| **Dec 3** | Submission | 100 | Submitted, and a backup copy of everything saved |

**Parallel tasks:**
- **Real shop:** by **Nov 20**, book a real pharmacy or kiryana owner in Islamabad or Rawalpindi who still uses an old DOS or FoxPro app. Get permission to film and to copy anonymised data files. If no real app is found by Nov 22, demo only our own sample apps and say so honestly.
- **Credits:** each member requests the 4,000 Kiro credits by **Dec 1, 12 PM PT**.
- **Social post** (#KiroweenHackathon26 at the very start): post in week 1. **Blog post:** publish by Dec 2.

---

## 7. Demo story (3-minute video)

1. **0:00–0:10, the hook.** "This pharmacy runs on software from 1998. The developer is gone. There's no source code. Just the .exe." Show the green DOS screen.
2. **0:10–0:40, possession.** Press **Raise**. The haunted cursor explores the menus by itself, and the data changes light up live.
3. **0:40–1:05, the soul.** Rules appear in plain English and Urdu, then the generated Kiro spec.
4. **1:05–1:35, the proof.** Split screen, old vs new; the counter climbs to "2,000 cases, 0 differences". The certificate is issued.
5. **1:35–1:55, the exorcism.** "Your old app has been rounding tax wrong for 25 years. Keep it or fix it?"
6. **1:55–2:20, real life.** The Ghost Twin replays a real day; the owner switches over; the power cut test shows the phone still works offline.
7. **2:20–2:40, Living Soul.** The owner says in Urdu "senior citizens ko 5% discount", and it's reverified and live.
8. **2:40–3:00, how Kiro built it.** Specs, hooks, Crew, PBT, MCP, the power, and the line "Software that outlives its source code."

---

## 8. Definition of done (whole product)

- [ ] Judges can open the live URL, pick a dead app from the Graveyard, raise it, and get a certificate in under 5 minutes, without logging in
- [ ] The pharmacy app is fully reborn: billing, stock, customers, daily report, offline on mobile
- [ ] The proof run works, and the certificate verifies at `/verify/<id>`
- [ ] Exorcist, Ghost Twin and Living Soul all work in the UI
- [ ] The Afterlife Kiro power installs and works in a fresh Kiro project
- [ ] `.kiro/` is rich: 10+ specs, 5+ hooks, 6 steering docs, custom agents, MCP config
- [ ] CI is green; there are unit + PBT + e2e tests, and the README shows coverage
- [ ] Public GitHub repo with MIT license, the video on YouTube under 3:00, the Kiro write-up, the blog, and the social post
- [ ] Devpost form filled out with the category and bonus prizes; test instructions included

---

## 9. Risks

| Risk | Plan B |
|---|---|
| The agent gets lost exploring an unknown app | A guided mode: the owner's recorded session (séance) gives the paths, and the agent only fills the gaps |
| Typing tests through the emulator is slow | Run several emulator instances in parallel; use 2,000 cases for the demo (not 10k); speed up the emulator clock |
| No real shop found | Use our own sample apps; tell the story honestly with an interview instead of live data |
| Bedrock access or limits | `LlmClient` interface with a second provider; cache all crew outputs for demo mode |
| Kiro Crew / powers format differs from what we expect | Read the Kiro docs on day 1 (Prompt 2) and adjust `.kiro/agents` and `powers/` to the real format |
