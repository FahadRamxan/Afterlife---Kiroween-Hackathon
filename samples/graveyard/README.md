# Graveyard

Sample dead DOS apps, written by our team to simulate 1990s software. They are real 16-bit DOS programs, compiled with Open Watcom v2, that write real dBASE III `.DBF` files.

| App                             | Folder    | Status           |
| ------------------------------- | --------- | ---------------- |
| Shifa Medical Store v2.3 (1998) | `shifa/`  | Done (Prompt 12) |
| Iqra School Fees 1.1 (2001)     | `iqra/`   | Prompt 13        |
| Barkat Kiryana Ledger (1996)    | `barkat/` | Prompt 14        |

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
<app>/build.env            EXE, LIBS (from toolchain/lib), SOURCES, SEED_DATE
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
```

`graveyard:test` runs:

1. every C unit test built with gcc on Linux
2. the same tests built for 16-bit DOS and run in DOSBox, where `int` is 16 bits
3. every seed CSV through `csv2dbf` and `dbf2csv`, which must give the same CSV back
4. a fresh build compared with the committed `dist/`. It fails if they differ
5. `HELLO.EXE`, then every `<app>/scenarios/*.keys`, in DOSBox
6. all outputs compared byte for byte with the committed `fixtures/`

`pnpm ci:local` runs it when Docker is running. The Vitest suites `tests/graveyard-*.test.ts` then check the fixtures against hand-worked expected values, so a wrong fixture cannot be committed by accident.

## How a scripted run works

The test build (`SHIFATST.EXE`) is the same app linked with `kbd_script.c` instead of `kbd_bios.c`. It reads `KEYS.TXT`, and `{Dump:NAME}` saves the screen to `NAME.SCR`: 25 text lines, `--ATTR--`, then 25 lines of colour attributes in hex. On exit it writes `EXIT.TXT`: `OK` only if the app exited normally with every key used. If the keys run out while the app still waits, it saves `END.SCR` and stops, so a run can never hang.

## Rules

- **`dist/` is committed.** The js-dos bundles (Prompt 15) need the EXEs, and Vercel cannot compile them. Run `pnpm graveyard:build` after changing any C source, and commit `dist/`.
- **The DOS date is 15 July 1998** unless a scenario has a `.time` file. DOSBox 0.74 has no `DATE` command and reads the host clock, so `run-dos.sh` starts it with `faketime`.
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

## Open Watcom version

The image pins the dated `2026-11-01-Build` release of open-watcom-v2 (not the rolling `Current-build`) and checks its SHA-256. The image tag is `afterlife-dos-toolchain:2026-11-01`.
