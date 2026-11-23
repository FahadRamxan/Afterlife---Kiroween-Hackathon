# Ghost Twin: shadow mode on a real shop PC

Ghost Twin lets a shop keep working in its old DOS app while Afterlife checks every real transaction in the reborn app. A small tool on the shop's PC watches the app's data folder and sends each change to Afterlife.

## What you need

- The shop's PC running the DOS app in DOSBox (Windows), with Node 22.
- The project raised on Afterlife, and a twin token from its Ghost Twin tab (shown once; make a new one if it is lost, which stops the old one).

## Run it

Point `--dir` at the folder DOSBox mounts as `C:` (the one with the app's `.DBF` files):

```powershell
$env:AFTERLIFE_TWIN_TOKEN = "tw_..."
pnpm twin --api https://<your-api> --project <project id> --dir "C:\DOSAPPS\SHIFA"
```

The token is read from `AFTERLIFE_TWIN_TOKEN` so it is not in the shell history; `--token` also works. `--interval` sets how often it looks (default 1000 ms). The other flags can come from `AFTERLIFE_API`, `AFTERLIFE_PROJECT` and `AFTERLIFE_DIR`.

It prints each change it sends. It never changes the data files: it only reads them.

## What it does

- Every interval it reads the folder's `.DBF` files and compares them with the last look. A change (a bill saved, stock taken off) becomes one event: the diff and the time.
- A file the DOS app is in the middle of writing cannot be read; it is read on the next look.
- If the API cannot be reached, the events wait and are sent in order once it can. An event the API already has counts as sent.
- The API takes events only with the project's twin token, and keeps only the token's hash.
