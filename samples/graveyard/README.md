# Graveyard

Sample dead DOS apps, written by our team to simulate 1990s software. They are real 16-bit DOS programs, compiled with Open Watcom v2, that write real dBASE III `.DBF` files.

| App                             | Folder    | Status           |
| ------------------------------- | --------- | ---------------- |
| Shifa Medical Store v2.3 (1998) | `shifa/`  | Done (Prompt 12) |
| Iqra School Fees 1.1 (2001)     | `iqra/`   | Done (Prompt 13) |
| Barkat Kiryana Ledger (1996)    | `barkat/` | Done (Prompt 14) |

`hello/` is the toolchain smoke test.

## Layout

```
toolchain/                 Docker image and scripts (Open Watcom v2, DOSBox, faketime, gcc)
  lib/dbf3.c               tiny dBASE III reader and writer used by every sample
  lib/screen.c, ui.c       80x25 text mode (video memory at B800) and input fields
  lib/kbd_bios.c           real keyboard, linked into the shipped EXE
  lib/kbd_script.c         scripted keyboard, linked into the test build only
  lib/kbd_parse.c          key-script parser ("1{Enter}PAN500{Enter}4{Enter}{Dump:LINES}")
  tools/csv2dbf, dbf2csv   host tools: seed CSV -> DBF, and DBF -> CSV for fixtures
  test/*test.c             C unit tests, run on gcc and on 16-bit DOS in DOSBox
<app>/build.env            EXE, LIBS (from toolchain/lib), SOURCES, SEED_DATE (YYYYMMDD), DOS_TIME
<app>/src/                 the app's C source
<app>/seed/*.csv           seed data, turned into .DBF files by the build
<app>/test/*test.c         the app's C unit tests (for example its business rules)
<app>/scenarios/*.keys     key scripts run in DOSBox; optional <name>.time sets the DOS clock
dist/<app>/                built EXE + seed DBFs (committed, see below)
fixtures/                  output of real DOSBox runs: unit test logs, screen dumps (*.SCR)
                           and the DBF files after each scenario (as CSV)
```

## Commands (need Docker)

```bash
pnpm graveyard:build    # compile every sample into dist/<app>/<EXE>
pnpm graveyard:test     # all toolchain checks, see below
pnpm graveyard:update   # same, but rewrites fixtures/ (review the git diff, then commit)
pnpm graveyard:publish  # js-dos bundles + the Graveyard page catalogue (no Docker needed)
```

`graveyard:test` runs:

1. every C unit test built with gcc on Linux
2. the same tests built for 16-bit DOS and run in DOSBox, where `int` is 16 bits
3. every seed CSV through `csv2dbf` and `dbf2csv`, which must give the same CSV back
4. a fresh build compared with the committed `dist/`. It fails if they differ
5. `HELLO.EXE`, then every `<app>/scenarios/*.keys`, in DOSBox
6. all outputs compared byte for byte with the committed `fixtures/`

`pnpm ci:local` runs it when Docker is running. The Vitest suites `tests/graveyard-*.test.ts` then check the fixtures against hand-worked expected values, so a wrong fixture cannot be committed by accident.

## Manifests and bundles

Each app has `<app>/manifest.json`, validated by the zod schema `GraveyardManifest` in `packages/emulator`. It holds the name, the born and died years, the era story (2 to 3 lines), the executable, the data files, the DOS clock, and two **hidden** lists:

- `knownRules`: the business rules the Archaeologist must find
- `knownBugs`: the legacy bugs the Exorcist must find

Every rule and bug names the scenarios that demonstrate it. The lists are used only to score the Crew (Prompt 56), and never leave the repo.

`pnpm graveyard:publish` writes:

- `apps/web/public/graveyard/<app>.jsdos`: a js-dos bundle (a zip with `.jsdos/dosbox.conf` plus the EXE and DBF files from `dist/`). It is byte-for-byte repeatable
- `apps/web/lib/graveyard-catalog.json`: what the Graveyard page shows. It has no hidden rules or bugs, adds the disclosure that our team wrote these apps, and includes the first screen of each app from a real DOSBox run as the preview

`tests/graveyard-manifests.test.ts` fails if either output is out of date, or if anything hidden reaches the catalogue.

## How a scripted run works

The test build (`SHIFATST.EXE`) is the same app linked with `kbd_script.c` instead of `kbd_bios.c`. It reads `KEYS.TXT`, and `{Dump:NAME}` saves the screen to `NAME.SCR`: 25 text lines, `--ATTR--`, then 25 lines of colour attributes in hex. On exit it writes `EXIT.TXT`: `OK` only if the app exited normally with every key used. If the keys run out while the app still waits, it saves `END.SCR` and stops, so a run can never hang.

## Rules

- **`dist/` is committed.** The js-dos bundles (Prompt 15) need the EXEs, and Vercel cannot compile them. Run `pnpm graveyard:build` after changing any C source, and commit `dist/`.
- **The DOS date** is the app's `DOS_TIME` in `build.env` (default 15 July 1998), or a scenario's `.time` file. DOSBox 0.74 has no `DATE` command and reads the host clock, so `run-dos.sh` starts it with `faketime`.
- **DOSBox runs at a fixed speed** (`cycles=fixed 20000`). With `cycles=max`, DOSBox hung in 4 of 100 runs. With fixed cycles there were 0 hangs in 200 runs, and each run takes about 1 second.
- **Runs are byte-for-byte repeatable.** Same EXE, same keys, same date, same output.
- **Stack size is 8 KB** (`-k8192`). Open Watcom's 2 KB default overflowed in `HELLO.EXE`, so the program stopped and printed nothing.
- **Use `long` for counts and money.** `int` is 16 bits on DOS (max 32,767). Money is in paisa: Rs 45.50 is `4550L`.
- **Warnings are errors** (`-w4 -we`), even a missing newline at the end of a file.
- **Legacy bugs are deliberate.** They are marked `LEGACY BUG` in the source and pinned by tests, so nobody fixes them by accident. The Exorcist (Prompt 73) must find them.

## Shifa Medical Store v2.3 (1998)

A pharmacy in Satellite Town, Rawalpindi. Blue and white text screens, keyboard only.

- **Menu:** 1 New Bill, 2 Stock, 3 Customers, 4 Daily Report, 5 Exit. Esc never leaves the program.
- **Data:** `MEDICINE.DBF` (40 medicines), `CUSTOMER.DBF` (8), `BILLS.DBF` and `BILLITEM.DBF` (3 June 1998 bills).
- **Hidden rules** (for the Archaeologist to find; listed in the manifest in Prompt 15):
  - 17% GST, truncated (not rounded) to the paisa
  - 10% discount when the subtotal is over Rs 5,000 (exactly Rs 5,000 gets none). Discount first, then GST
  - expired batches cannot be sold. A batch expiring today still can
  - stock goes down by the quantity sold
  - bill numbers are `YYMM-####`, restarting at 0001 each month
  - a quantity above stock is refused
  - a new customer gets the next id (`C0009`), and a blank name is refused
- **Legacy bugs:**
  1. The expiry check compares two-digit years. In 1998 it blocks a batch good until 2000 (`ORS001`). In January 2000 it sells a batch that expired in 1998 (`SEP200`).
  2. Quantity 0 skips the stock check, and F3 (edit last quantity) never checks stock. `THY050` (3 in stock) can be sold 5 times, leaving -2.

The 12 scenarios in `shifa/scenarios` cover every rule and both bugs.

## Iqra School Fees 1.1 (2001)

Monthly fee collection for Iqra Model School, Chaklala Scheme III, Rawalpindi. Keyboard navigation: a highlight-bar menu (Up/Down, Enter), Enter and Up between form fields, F2 to save, Esc to go back.

- **Menu:** Collect Fee, Students, Fee Schedule, Today's Receipts, Exit. Up from the top wraps to Exit. Esc never leaves the program.
- **Data:** `STUDENT.DBF` (60 students in 48 families: 37 only children, 10 pairs, 1 family of 3), `FEES.DBF` (classes 1 to 10), `PAYMENT.DBF` (6 February 2001 receipts).
- **Hidden rules:**
  - the monthly fee comes from the student's class
  - 15% sibling discount for the second and later children (`SIB` >= 2), truncated to the paisa
  - Rs 50 late fee per week after the 10th of the fee month, capped at Rs 500. The late fee is not discounted
  - receipt numbers are sequential (`000007` after `000006`)
  - a month already paid for that student is refused, naming the receipt
  - the fee month (MMYYYY) defaults to the current month, and month 13 or year 1979 is refused
- **Legacy bug:** the late fee counts calendar weeks (Monday to Sunday) between the due date and the payment, not days. Paying on Sunday 11 March 2001 (1 day late) costs nothing; paying on Sunday 18 March (8 days late) costs 1 week, not 2.

The 13 scenarios in `iqra/scenarios` cover every rule and the bug. `tests/graveyard-iqra.test.ts` checks the seed receipts against an independent TypeScript version of the rules.

## Barkat Kiryana Ledger (1996)

The udhaar (credit) register of a kiryana store in Raja Bazaar, Rawalpindi. Letter hotkeys on the menu, and a Y/N confirm before every save.

- **Menu:** S Sale on credit, P Payment, L Ledger of a party, B Balances, R Reminders, X Exit. Lower case works. Esc never leaves the program.
- **Data:** `PARTY.DBF` (25 parties with romanised Urdu names, such as `PHUPHO NASREEN` and `CHACHA KHAIR DIN`) and `LEDGER.DBF` (80 entries, October and November 1996). `seed/make-seed.ps1` generates both and refuses any history that breaks the rules.
- **Hidden rules:**
  - a running balance per party: a sale adds, a payment subtracts, and each ledger row stores the balance after it
  - a sale that would take the balance over the party's credit limit is refused. Exactly the limit is allowed
  - a payment above the balance is refused (no advance payments)
  - the monthly reminder list: every party that owes money and has not paid since the 1st of the month. It is interest-free, so it only reminds
  - ledger entries are numbered in order, and a payment sets the party's last payment date
- **Legacy bug:** `BALANCE` is `N(8,2)`, so it holds at most 99,999.99. A larger balance is written as `********`, the way dBASE's `STR()` does, and `********` reads back as 0. P001 owes Rs 98,500; after a Rs 2,000 sale the balance shows `********`, and the next Rs 500 sale leaves Rs 500. Rs 1,00,500 of credit disappears.

The 12 scenarios in `barkat/scenarios` cover every rule and the bug.

## Open Watcom version

The image pins the dated `2026-11-01-Build` release of open-watcom-v2 (not the rolling `Current-build`) and checks its SHA-256. The image tag is `afterlife-dos-toolchain:2026-11-01`.
