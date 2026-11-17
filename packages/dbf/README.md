# @afterlife/dbf

Pure TypeScript reader and writer for dBASE III and FoxPro 2.x `.DBF` files. `Uint8Array` only, so it runs in the browser, in Node and in the worker.

```ts
import { readDbf, writeDbf } from '@afterlife/dbf';

const { header, fields, records } = readDbf(bytes);
records[0].values.PRICE; // "12.50": exact decimal text, never a float
```

## Values

| Type | Read as                                                               | Blank             |
| ---- | --------------------------------------------------------------------- | ----------------- |
| C    | text in code page 437, trailing spaces trimmed                        | `''`              |
| N, F | exact decimal text (`"45.50"`), or dBASE's `********` overflow marker | `null`            |
| D    | `"YYYYMMDD"`                                                          | `null`            |
| L    | `true` (`T t Y y`) or `false` (`F f N n`)                             | `null` (also `?`) |
| M    | memo block number (the memo text lives in the `.DBT` or `.FPT` file)  | `null`            |

`header` has the version byte, the last update date (the year byte counts from 1900, so 101 is 2001), the record count, the header and record lengths, the code page byte (offset 29), and whether the version has a memo file.

Errors are a `DbfError` with a `code`: `TOO_SHORT`, `BAD_VERSION`, `BAD_HEADER`, `BAD_FIELD`, `TRUNCATED`, `BAD_VALUE`, `WIDTH`.

## Writer

`writeDbf({ fields, records, lastUpdate?, version?, codePage? })` writes byte-exact dBASE III: header, NUL-padded field descriptors, `0x0D`, fixed-width records (text left-aligned, numbers right-aligned), then `0x1A`. The update date defaults to 1 Jan 1980, so output never depends on the clock. Numbers must be decimal text with exactly the field's decimals (never a JS number). A value that does not fit throws `DbfError` with code `WIDTH`.

## Snapshot and diff

```ts
import { diffSnapshots, snapshot } from '@afterlife/dbf';
import { snapshotDir } from '@afterlife/dbf/node'; // Node only

const before = await snapshotDir('C:/SHOP'); // or snapshot({ 'MEDICINE.DBF': bytes, ... })
// ... the DOS app saves a bill ...
const d = diffSnapshots(before, await snapshotDir('C:/SHOP'));
d.tables['MEDICINE.DBF'].updated;
// [{ key: 'PAN500', changes: [{ field: 'QTY', before: '240', after: '236', delta: '-4' }] }]
```

- A snapshot holds the SHA-256 and the parsed table of every `.DBF`, by upper-case file name. Files whose hash did not change are listed as `unchanged` and not compared.
- Records are matched by a **key field** when there is one: a C or N field named like a key (ending in `ID`, `CODE`, `NO`, `ENTRY` or `RECEIPT`) whose values are unique and never blank in both snapshots. Otherwise they are matched by **record number**. A field that is only unique by chance, like `QTY`, is never used.
- A record flagged `*` counts as deleted, as in dBASE. A key that changes shows as a delete plus an insert.
- `delta` is `after - before` for N and F fields, exact (decimal.js), with the field's decimals. It is `null` when a side is blank or `********`.
- `applyDiff(liveView(a, d.key), d)` equals `liveView(b, d.key)`: the live records, by key or by record number.

## Tests

- `reader.test.ts`: every `.DBF` of the three sample apps (written by our C library) against its seed CSV, `HELLO.DBF` written inside DOSBox, every field type, and every error.
- `roundtrip.prop.test.ts`: `readDbf(writeDbf(x)) == x` for generated tables, at least 1,000 runs, and `write(read(write(x)))` is byte-identical.
- `writer.test.ts`: rewriting all 9 sample files gives the same bytes the C library wrote; the exact layout; every refused value.
- Golden: every DOS scenario runs on files written by this writer and gives identical results. See `docs/dbf-golden.md`.
- `diff.test.ts` and `diff.prop.test.ts`: `diff(a, a)` is empty, applying the diff gives `b`, inserts and deletes are antisymmetric, and `before + delta == after` exactly, over generated tables edited the way DOS apps do (update, delete, append, pack, key change).
- `tests/dbf-diff.test.ts`: real data, the seed files against the DOSBox output of Shifa, Barkat and Iqra scenarios.
