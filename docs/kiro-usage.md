# How we use Kiro

A running log of how Kiro builds Afterlife. Prompt 98 turns this into the final write-up.

## Steering

Files in `.kiro/steering/`, all `inclusion: always` except `pre-commit-check.md` (manual).

| File                  | Purpose                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| `product.md`          | What Afterlife is, the users, the six Crew agents, the demo flow                 |
| `tech.md`             | The stack, and "always prefer these libraries"                                   |
| `structure.md`        | Repo layout and naming rules                                                     |
| `crew.md`             | Each agent's role, inputs and outputs                                            |
| `testing-rule.md`     | Tests first, then UI, then e2e, then commit and push. The rule that matters most |
| `pre-commit-check.md` | On-demand `/pre-commit-check`: runs `pnpm verify` and summarises it              |

Check from Prompt 3: asked "what stack do we use for queues?", Kiro answered pg-boss, from `tech.md`. `tests/steering.test.ts` also checks that `tech.md` names pg-boss as the queue.

## Hooks

Hook files are in `.kiro/hooks/`. We created them with Kiro's own hook tool, which writes the `version: "v1"` format. Each hook runs `node scripts/hooks/run.mjs <name>`. The script reads the event JSON from stdin, and its logic is unit-tested in `tests/hooks-lib.test.ts` and `tests/hooks.test.ts`. Each run is appended to `.kiro/.hook-runs.jsonl`, which is git-ignored.

| Hook                   | Trigger           | Matcher                                    | What it does                                                                                |
| ---------------------- | ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `test-on-save`         | `PostFileSave`    | `packages/*/src/**.ts(x)`                  | Runs that package's Vitest project                                                          |
| `pbt-on-oracle-change` | `PostFileSave`    | `packages/oracle/**`, `packages/vessel/**` | Runs the oracle and vessel property suites                                                  |
| `spec-sync`            | `PostTaskExec`    | none                                       | Checks every `- [x]` task in `.kiro/specs/*/tasks.md` has a test tagged `@spec <spec>#<id>` |
| `a11y-check`           | `PostFileSave`    | `apps/web/app/**/page.tsx`                 | Runs `e2e/a11y.spec.ts` (axe) on that page's route                                          |
| `pre-commit-check`     | manual (steering) | n/a                                        | `/pre-commit-check` runs `pnpm verify` and summarises the result                            |

`pre-commit-check` is a manual steering file because Kiro IDE 1.0 has no manual hook trigger (see `docs/kiro-formats.md`).

### First firing (Prompt 7)

Each hook was fired once by piping it a save event. Firing inside the IDE was confirmed later, once the workspace was trusted (see "Confirmed in the IDE" below).

Real firings are logged to `.kiro/.hook-runs.jsonl` with `"source": "kiro"`. Test runs go to a temp file with `"source": "test"`, so that log only holds real firings.

| Hook                   | Event                                              | Result                                                   |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `test-on-save`         | save `packages/dbf/src/index.ts`                   | `PASS @afterlife/dbf`                                    |
| `test-on-save`         | save a deliberately failing test in `packages/dbf` | exit 1, `FAIL @afterlife/dbf`, `× broken on purpose`     |
| `pbt-on-oracle-change` | save `packages/oracle/src/index.ts`                | `PASS oracle + vessel property suites`                   |
| `spec-sync`            | task finished, no specs yet                        | `All 0 completed spec task(s) are referenced by a test.` |
| `spec-sync`            | a temporary spec with `- [x] 1.` and no test       | exit 1, `tmp-demo#1 Something done without a test`       |
| `a11y-check`           | save `apps/web/app/page.tsx`                       | `PASS axe on /`                                          |

## MCP

### MCP: Kiro driving a 1998 app

Prompt 33. A real Kiro IDE chat on 2026-11-19, the session in which this section was written. Fahad asked Kiro to explore Shifa itself with the `afterlife-emulator` MCP server (`.kiro/settings/mcp.json`, `packages/mcp-emulator`). Kiro made the calls below, one at a time, in this order. Each result is copied as the server returned it. Where a result is long or repeats an earlier one, it is cut, and a `[trimmed: ...]` line says what was left out. Nothing else was changed.

The bill's results are saved as a test fixture: `packages/soul/src/examples/__fixtures__/mcp-pan500-bill.json`. `shifa-mcp.test.ts` checks them against the reference Soul's rules (subtotal, 10% discount over Rs 5,000, 17% GST truncated, total, stock decrement).

**1. `list_apps` `{}`**

```text
barkat: Barkat Kiryana Ledger (DOS clock 1996-11-20 10:00:00)
iqra: Iqra School Fees (DOS clock 2001-03-12 10:00:00)
shifa: Shifa Medical Store (DOS clock 1998-07-15 10:00:00)
```

**2. `boot_app` `{"name": "shifa"}`**

```text
Screen: MAIN MENU
 SHIFA MEDICAL STORE  v2.3         MAIN MENU                           15/07/98


                     S H I F A   M E D I C A L   S T O R E
                           Satellite Town, Rawalpindi


                           ┌────────────────────────┐
                           │                        │
                           │    1  New Bill         │
                           │    2  Stock            │
                           │    3  Customers        │
                           │    4  Daily Report     │
                           │    5  Exit             │
                           │                        │
                           └────────────────────────┘


                                Choice:





 1-5 Select    (C) 1998 Shifa Software House, Rawalpindi
```

**3. `read_screen` `{}`** (the main menu)

```text
Screen: MAIN MENU
 SHIFA MEDICAL STORE  v2.3         MAIN MENU                           15/07/98
[trimmed: the other 24 lines, the same as the boot_app result above]
```

**4. `send_keys` `{"keys": "2"}`** (open Stock)

```text
Screen: STOCK
 SHIFA MEDICAL STORE  v2.3           STOCK                             15/07/98

 Medicines in stock
 CODE   NAME                 BATCH    EXPIRY       PRICE    QTY
 PAN500 PANADOL 500MG STRIP  B98031   31/12/99     12.50    240
 BRU400 BRUFEN 400MG STRIP   B97112   30/06/99     18.75    180
 AUG625 AUGMENTIN 625MG      A98020   31/03/99    165.00     60
 FLA400 FLAGYL 400MG STRIP   F98011   30/11/99      9.80    300
 DIS500 DISPRIN 300MG STRIP  D98004   31/08/99      6.25    400
 ARI050 ARINAC FORTE         R98010   28/02/99     22.40    150
 SEP200 SEPTRAN DS           S97090   30/06/98     14.00     90  EXPIRED
 VEN100 VENTOLIN INHALER     V98055   31/10/99     95.00     35
 INS100 INSULIN MIXTARD 10ML I98021   31/01/99    650.00     12
[trimmed: 8 more medicine rows, CAL500 to GRA001; ORS001 is marked EXPIRED]

 Page 1 of 3   40 items

 PgDn=Next page  PgUp=Previous page  Esc=Back

No data changed.
```

**5. `send_keys` `{"keys": "{PgDn}"}`**

```text
Screen: STOCK
 SHIFA MEDICAL STORE  v2.3           STOCK                             15/07/98

 Medicines in stock
 CODE   NAME                 BATCH    EXPIRY       PRICE    QTY
 DEX004 DEXAMETHASONE INJ    X98003   30/06/99      7.50    100
 MUL200 MULTIVITAMIN SYRUP   U98022   31/03/01     55.00     45  EXPIRED
 CEF250 CEFSPAN 400MG        E98010   30/09/99    210.00     30
[trimmed: 14 more medicine rows, RIS001 to POL001]

 Page 2 of 3   40 items

 PgDn=Next page  PgUp=Previous page  Esc=Back

No data changed.
```

**6. `read_screen` `{}`** (page 2)

```text
Screen: STOCK
 SHIFA MEDICAL STORE  v2.3           STOCK                             15/07/98
[trimmed: the other 24 lines, the same as the {PgDn} result above, without "No data changed."]
```

**7. `send_keys` `{"keys": "{Esc}"}`**

```text
Screen: MAIN MENU
 SHIFA MEDICAL STORE  v2.3         MAIN MENU                           15/07/98
[trimmed: the other 24 lines, the same as the boot_app result above]

No data changed.
```

**8. `snapshot_data` `{}`**

```text
BILLITEM.DBF: 4 records
BILLS.DBF: 3 records
CUSTOMER.DBF: 8 records
MEDICINE.DBF: 40 records
```

**9. `send_keys` `{"keys": "1"}`** (New Bill)

```text
Screen: NEW BILL
 SHIFA MEDICAL STORE  v2.3          NEW BILL                           15/07/98

 Customer ID (blank = walk-in):
[trimmed: 21 blank lines]
 Enter=Continue  Esc=Back to menu

No data changed.
```

**10. `send_keys` `{"keys": "{Enter}"}`** (walk-in customer)

```text
Screen: NEW BILL
 SHIFA MEDICAL STORE  v2.3          NEW BILL                           15/07/98

 Customer: WALK-IN

  # CODE   NAME                 BATCH        PRICE   QTY      AMOUNT
[trimmed: 14 blank lines]
 ───────────────────────────────────────────────────────────────────
                                             SUBTOTAL           0.00
 Code:          Qty:


 Enter=Add  Enter on blank code=Finish  F3=Edit last qty  Esc=Cancel

No data changed.
```

**11. `send_keys` `{"keys": "PAN500{Enter}2{Enter}"}`**

```text
Screen: NEW BILL
 SHIFA MEDICAL STORE  v2.3          NEW BILL                           15/07/98

 Customer: WALK-IN

  # CODE   NAME                 BATCH        PRICE   QTY      AMOUNT
  1 PAN500 PANADOL 500MG STRIP  B98031       12.50     2       25.00
[trimmed: 13 blank lines]
 ───────────────────────────────────────────────────────────────────
                                             SUBTOTAL          25.00
 Code:          Qty:


 Enter=Add  Enter on blank code=Finish  F3=Edit last qty  Esc=Cancel

No data changed.
```

**12. `send_keys` `{"keys": "{Enter}"}`** (a blank code finishes the bill)

```text
Screen: NEW BILL
 SHIFA MEDICAL STORE  v2.3          NEW BILL                           15/07/98

 Customer: WALK-IN

  # CODE   NAME                 BATCH        PRICE   QTY      AMOUNT
  1 PAN500 PANADOL 500MG STRIP  B98031       12.50     2       25.00
[trimmed: 12 blank lines]
 ───────────────────────────────────────────────────────────────────
                                         SUBTOTAL              25.00
                                         DISCOUNT 10%           0.00
                                         GST 17%                4.25
                                         TOTAL                 29.25

 F2=Save bill  Esc=Cancel

No data changed.
```

**13. `send_keys` `{"keys": "{F2}"}`** (save)

```text
Screen: NEW BILL
[trimmed: the 19 lines above the totals, the same as the result above]
                                         SUBTOTAL              25.00
                                         DISCOUNT 10%           0.00
                                         GST 17%                4.25
                                         TOTAL                 29.25
  BILL 9807-0001 SAVED - PRESS ANY KEY
 F2=Save bill  Esc=Cancel

Data changed: BILLITEM.DBF, BILLS.DBF, MEDICINE.DBF
```

**14. `read_screen` `{}`**

```text
Screen: NEW BILL
[trimmed: the 25 lines, the same as the {F2} result above, without "Data changed: ..."]
```

**15. `diff_data` `{}`**

```text
BILLITEM.DBF: 1 inserted, 0 deleted, 0 changed
BILLS.DBF: 1 inserted, 0 deleted, 0 changed
MEDICINE.DBF: 0 inserted, 0 deleted, 1 changed
```

`diff_data` gives counts only, so Kiro read the three changed tables to see the values.

**16. `read_table` `{"file": "BILLS.DBF"}`**

```text
BILLS.DBF: 4 records
BILL_NO | BILL_DATE | CUST_ID | SUBTOTAL | DISCOUNT | GST | TOTAL
9806-0001 | 19980610 | C0001 | 250.00 | 0.00 | 42.50 | 292.50
9806-0002 | 19980622 |  | 5600.00 | 560.00 | 856.80 | 5896.80
9806-0003 | 19980630 | C0006 | 98.00 | 0.00 | 16.66 | 114.66
9807-0001 | 19980715 |  | 25.00 | 0.00 | 4.25 | 29.25
```

**17. `read_table` `{"file": "BILLITEM.DBF"}`**

```text
BILLITEM.DBF: 5 records
BILL_NO | LINE | CODE | QTY | PRICE | AMOUNT
9806-0001 | 1 | PAN500 | 20 | 12.50 | 250.00
9806-0002 | 1 | INS100 | 8 | 650.00 | 5200.00
9806-0002 | 2 | FOL005 | 100 | 4.00 | 400.00
9806-0003 | 1 | DUP001 | 1 | 98.00 | 98.00
9807-0001 | 1 | PAN500 | 2 | 12.50 | 25.00
```

**18. `read_table` `{"file": "MEDICINE.DBF", "limit": 3}`**

```text
MEDICINE.DBF: 40 records
CODE | NAME | BATCH | EXPIRY | PRICE | QTY
PAN500 | PANADOL 500MG STRIP | B98031 | 19991231 | 12.50 | 238
BRU400 | BRUFEN 400MG STRIP | B97112 | 19990630 | 18.75 | 180
AUG625 | AUGMENTIN 625MG | A98020 | 19990331 | 165.00 | 60
```

**19. `reset` `{}`**

```text
Screen: MAIN MENU
 SHIFA MEDICAL STORE  v2.3         MAIN MENU                           15/07/98
[trimmed: the other 24 lines, the same as the boot_app result above]
```

What the run shows:

- The bill for 2 x PAN500 at Rs 12.50 is Rs 25.00. It gets no discount, because Rs 25.00 is not over Rs 5,000. GST is 17% of 25.00, which is 4.25 exactly. The total is 29.25. The bill number is 9807-0001: the first bill of July 1998, by the DOS clock.
- PAN500's stock went from 240 (Stock screen, step 4) to 238 (`MEDICINE.DBF`, step 18).
- Esc on Stock went back to the main menu, and every screen change before F2 said "No data changed".

What the chat showed of each result:

- Each tool returns its text and a `structuredContent` object (`packages/mcp-emulator/src/server.ts`): the ScreenModel for the screens, and the changed records with their values for `diff_data`. Kiro IDE showed the agent only the text, so this transcript is the text. That is why the bill's values were read with `read_table` after `diff_data`.

## Specs

Filled in as feature specs are created in `.kiro/specs/`.

### Bug found and fixed: paths with spaces (local-CI fix)

The review found that a hook given a full path reported "nothing to test" and exited 0. The cause: `looksLikeFile` rejected paths with spaces, and this repo lives in `Matrix AE Hackathons`. Reproduced before the fix:

```text
[test-on-save] No package source file in the event, nothing to test.   (exit 0, tested nothing)
```

After the fix, the same event gives `PASS @afterlife/dbf`. `file://` URIs are decoded. An event with no usable path now runs every package (or every route for `a11y-check`) and names the event's keys, so a hook can never look green without testing.

### Confirmed in the IDE (Prompts 15 to 20)

The hooks did not fire at first because Kiro IDE had the repo folder in Restricted Mode (VS Code
Workspace Trust, banner hidden in our settings). An untrusted workspace disables v2 hooks, skips the
workspace steering files, and asks before every shell command even when `permissions.yaml` allows
it. Kiro's log said `hooks.v2.executionDisabledUntrustedWorkspace` at session start. After
**Workspaces: Manage Workspace Trust → Trust** and a restart (17 Nov, 20:11 PKT), the hooks fired on
their own while Kiro built Prompts 15 to 20. `.kiro/.hook-runs.jsonl` holds 22 real firings
(`"source": "kiro"`) between 15:11 and 19:13 UTC on 17 Nov:

| Hook           | Package or route      | Pass | Fail |
| -------------- | --------------------- | ---- | ---- |
| `test-on-save` | `@afterlife/dbf`      | 1    | 9    |
| `test-on-save` | `@afterlife/ui`       | 3    | 4    |
| `test-on-save` | `@afterlife/screen`   | 1    | 1    |
| `test-on-save` | `@afterlife/emulator` | 0    | 2    |
| `a11y-check`   | axe on `/design`      | 1    | 0    |

The failures are the red step of test-first work: Kiro saved a new test before the code that makes
it pass, the hook reported the failure, and the next save went green.

| Check                                                                                  | Result                  |
| -------------------------------------------------------------------------------------- | ----------------------- |
| `test-on-save` runs by itself when Kiro saves a package file                           | confirmed, 21 firings   |
| `a11y-check` runs by itself when a page file is saved                                  | confirmed, `/design`    |
| Timeout the Hooks panel shows for `a11y-check` (300 s is set at hook and action level) | not checked yet         |
| Screenshot of the Hooks panel for the write-up                                         | still to take (a human) |

## IDE vs CLI vs Crew

GitHub Actions is off for this repo. The nightly check is a Kiro Crew scheduled job that runs `pnpm ci:local` on `main` (job text in `docs/kiro-formats.md`). Fill in the first nightly result here.
