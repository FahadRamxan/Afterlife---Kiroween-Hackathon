# Graveyard

Sample dead DOS apps, written by our team to simulate 1990s software. They are real 16-bit DOS programs, compiled with Open Watcom v2, that write real dBASE III `.DBF` files.

## Layout

```
toolchain/            Docker image and scripts (Open Watcom v2, DOSBox, faketime, gcc)
  lib/dbf3.c, dbf3.h  tiny dBASE III reader and writer used by every sample
  test/dbf3test.c     its unit tests, run on gcc and on 16-bit DOS in DOSBox
<app>/build.env       EXE=<NAME>.EXE and SOURCES="src/a.c ..."
<app>/src/            the app's C source
<app>/seed/*.DBF      seed data, copied next to the EXE
dist/<app>/           built EXE + seed DBFs (committed, see below)
fixtures/             output of real DOSBox runs, checked by tests/graveyard-toolchain.test.ts
```

## Commands (need Docker)

```bash
pnpm graveyard:build   # compile every sample into dist/<app>/<EXE>
pnpm graveyard:test    # all toolchain checks, see below
```

`graveyard:test` runs:

1. the `dbf3` unit tests built with gcc on Linux
2. the same tests built for 16-bit DOS and run in DOSBox, where `int` is 16 bits
3. a fresh build compared with the committed `dist/`. It fails if they differ
4. `HELLO.EXE` in DOSBox, checking what it prints and the DBF it writes. The output is saved to `fixtures/hello`

`pnpm ci:local` runs it when Docker is running.

## Rules

- **`dist/` is committed.** The js-dos bundles (Prompt 15) need the EXEs, and Vercel cannot compile them. Run `pnpm graveyard:build` after changing any C source, and commit `dist/`.
- **The DOS date is 15 July 1998 in every run.** DOSBox 0.74 has no `DATE` command and reads the host clock, so `run-dos.sh` starts it with `faketime`. Runs are byte-for-byte repeatable. Set `DOS_TIME` to change it.
- **Stack size is 8 KB** (`-k8192`). Open Watcom's 2 KB default overflowed in `HELLO.EXE` (a `DBF` struct plus two 1 KB record buffers), so the program stopped and printed nothing.
- **Use `long` for counts and money.** `int` is 16 bits on DOS (max 32,767). `dbf3` passes numbers as scaled longs: Rs 45.50 in an `N(8,2)` field is `4550L`.
- **Warnings are errors** (`-w4 -we`), even a missing newline at the end of a file.

## Open Watcom version

The image pins the dated `2026-11-01-Build` release of open-watcom-v2 (not the rolling `Current-build`) and checks its SHA-256. The image tag is `afterlife-dos-toolchain:2026-11-01`.
