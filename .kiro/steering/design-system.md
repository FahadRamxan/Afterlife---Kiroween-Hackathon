---
inclusion: always
---

# Design system: Haunted Ledger

Spooky effects must also mean something functional. If an effect carries no meaning, remove it.

Code is in `packages/ui` (`@afterlife/ui`). Tokens are in `src/tokens.ts`, and Tailwind gets them from `src/theme.css`. The live catalogue is at `/design`.

## Colours

Each colour has one job. Do not use a colour for anything else.

| Token       | Hex       | Meaning                                               |
| ----------- | --------- | ----------------------------------------------------- |
| `graveyard` | `#0B0F0C` | Page background                                       |
| `phosphor`  | `#33FF66` | Text from the original DOS app, and only that         |
| `ectoplasm` | `#5EEAD4` | Primary actions, inserted data, the agent's presence  |
| `candle`    | `#F5B544` | Progress, changed values, years and dates             |
| `bone`      | `#EDE6D6` | Body text, paper (the certificate)                    |
| `blood`     | `#E5484D` | Differences, deleted data, legacy bugs, "Fix" actions |

Use them as Tailwind classes: `bg-graveyard`, `text-phosphor`, `border-candle/40`.

Contrast: bone, phosphor, ectoplasm and candle on graveyard pass WCAG AA for body text. Blood on graveyard passes AA for large text only, so use it as a background with graveyard text, or for large text.

## Fonts

- **IBM Plex Mono** (`font-mono`): anything from the old app, file names, numbers in proofs.
- **Inter** (`font-sans`, the default): the UI.
- **Noto Nastaliq Urdu** (`font-urdu`): Urdu text. Always set `lang="ur"` and `dir="rtl"`, with line height around 2.

Fonts load through `next/font` in `apps/web/app/fonts.ts`.

## Components

| Component          | Means                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `Button`           | `primary` moves the flow forward. `danger` changes old behaviour. Also `secondary`, `ghost`. Use `asChild` for links |
| `Card`             | A neutral container                                                                                                  |
| `Tombstone`        | A dead app that can be raised. Shows name and born–died years                                                        |
| `CRTFrame`         | The real legacy app running live. Never wrap the reborn app in it                                                    |
| `GhostCursor`      | The cell the Possessor is typing into. Place inside a relative grid with `--cell-h`                                  |
| `DiffBadge`        | Data change kind: `inserted` teal, `deleted` red with strike, `changed` amber, `same` bone                           |
| `ProgressCandle`   | Progress. The candle burns down as work completes. It is a `progressbar`                                             |
| `CertificateFrame` | The signed proof of rebirth: bone paper and a wax seal                                                               |

## Rules

- Build with the components and tokens. Do not hard-code hex values in apps.
- Use `cn()` from `@afterlife/ui` to merge classes (shadcn/ui pattern).
- Respect `prefers-reduced-motion`: every animation must stop under it. `theme.css` does this for the classes `crt-scanlines`, `crt-glow`, `ghost-cursor`, `candle-flame` and `graveyard-fog`. New animations must be added there (`tokens.test.ts` fails otherwise).
- `graveyard-fog` drifts over an idle CRT preview: it means the app is dormant, not running.
- Motion timings: `fast` 150 ms, `base` 300 ms, `slow` 600 ms (`motion` in `tokens.ts`).
- Decorative effects get `aria-hidden="true"`. Anything that carries meaning also needs text or an ARIA label.
- Every new component goes on `/design` with a Playwright snapshot in `e2e/design.spec.ts`.
- Linux snapshot baselines (for CI) come from `pnpm snapshots:linux`, which runs in the Playwright Docker image. Windows baselines come from `playwright test --update-snapshots`.
