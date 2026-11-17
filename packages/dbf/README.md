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

## Tests

- `reader.test.ts`: every `.DBF` of the three sample apps (written by our C library) against its seed CSV, `HELLO.DBF` written inside DOSBox, every field type, and every error.
- `roundtrip.prop.test.ts`: `readDbf(writeDbf(x)) == x` for generated tables, at least 1,000 runs, and `write(read(write(x)))` is byte-identical.
