# DBF writer golden test (Prompt 18)

Question: does a `.DBF` written by our TypeScript writer (`@afterlife/dbf`) open and work in the 1990s DOS apps?

## How it is checked

1. `pnpm dbf:golden` builds every data file of the three sample apps from the seed CSVs with `writeDbf` only, without the C `csv2dbf` tool. The output goes to `samples/graveyard/golden/<app>/`.
2. `pnpm graveyard:test` (step 5c) runs **every** scenario of Shifa, Iqra and Barkat in DOSBox a second time, on the golden files instead of the C-written ones. The screens and the data files afterwards must be identical to the normal run.
3. `tests/dbf-golden.test.ts` checks the golden files are up to date and byte-identical to what the C library wrote.
4. `packages/dbf/src/writer.test.ts` rewrites all 9 sample files with `writeDbf` and checks the bytes match.

This runs on every `pnpm ci:local`, not just once.

## Result (17 Nov 2026)

```text
== 5b. scripted scenarios in DOSBox
... 37 scenarios (dist): OK
== 5c. the same scenarios on the golden DBFs written by @afterlife/dbf
... 37 scenarios (golden): OK
golden DBFs: every scenario gives the same screens and data
toolchain test PASSED
```

All 37 scenarios (12 Shifa, 13 Iqra, 12 Barkat) give identical screens and data on the TypeScript-written files, and all 9 files are byte-identical to the C output.

## The check can fail

To prove step 5c catches a difference, PAN500's price in `golden/shifa/MEDICINE.DBF` was changed from 12.50 to 12.60. The run failed:

```text
diff -r .../shifa/bill-small/BILLITEM.csv .../shifa/bill-small/BILLITEM.csv
diff -r .../shifa/bill-small/BILLS.csv .../shifa/bill-small/BILLS.csv
FAIL: shifa: the DOS app behaves differently on the golden DBFs (TypeScript writer)
```

The writer's own tests were checked the same way: left-aligning numbers failed 9 tests, and writing a two-digit year byte failed 5.
