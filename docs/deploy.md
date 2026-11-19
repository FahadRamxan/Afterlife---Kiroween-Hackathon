# Deploying Afterlife

| Part          | Host   | How                                                |
| ------------- | ------ | -------------------------------------------------- |
| `apps/web`    | Vercel | Next.js, root directory `apps/web`                 |
| `apps/api`    | Render | Docker web service, `apps/api/Dockerfile`          |
| `apps/worker` | Render | Docker background worker, `apps/worker/Dockerfile` |
| Postgres 16   | Neon   | Serverless Postgres                                |

Secrets go in each host's dashboard only. Never commit `.env` files. Every app has a `.env.example` listing what it needs.

## 1. Neon (Postgres)

1. Create a project named `afterlife` on neon.tech, Postgres 16, region **AWS Asia Pacific (Singapore)** (closest to Pakistan and to Render Singapore).
2. Copy the **direct** connection string from **Connection details** (the host has no `-pooler`). Keep `?sslmode=require`.
   - Use the direct one, not the pooled one, for both services. The pooled URL goes through PgBouncer in transaction mode, which breaks session features the app uses: the advisory lock that lets the API and the worker migrate at the same time, pg-boss (Prompt 37), and `LISTEN/NOTIFY` (Prompt 38). Each service opens at most 5 connections, well inside Neon's limit.
3. Nothing to run by hand: the API applies the migrations in `packages/db/migrations` when it starts (`pnpm db:migrate` does the same from a laptop). `pnpm db:seed` adds the three Graveyard projects. A migration can be undone with `pnpm db:migrate:down` (one step at a time).

## 2. Render (API and worker)

`render.yaml` is a Blueprint for both services.

1. On render.com: **New → Blueprint**, connect the GitHub repo, pick the `main` branch. Render reads `render.yaml`.
2. Render asks for the `sync: false` values:
   - `afterlife-api`: `WEB_ORIGINS` = the Vercel URL (step 3), for example `https://afterlife.vercel.app`. Comma-separate several. `DATABASE_URL` = the Neon direct URL. Without it the API keeps séances in memory, and the footer of the web app says "in memory: lost on restart".
   - `afterlife-worker`: `DATABASE_URL` = the Neon direct URL.
3. Render builds each Dockerfile from the repo root. The API health check is `GET /health`. A deploy only goes live once it returns 200. `render.yaml` sets `TRUST_PROXY=1` on the API, so the per-IP rate limits (300 requests a minute, 20 raises and 20 séances a minute) see the visitor's address and not Render's proxy. `1` trusts only proxies on a private network (Render's): an address a visitor writes into `X-Forwarded-For` themselves is never used. If the API ever sits behind another proxy too, set `TRUST_PROXY` to its addresses (comma-separated).
   - The API documents itself: `https://<api>/api/docs` (Swagger UI) and `https://<api>/api/openapi.json`.
4. Note the API URL, for example `https://afterlife-api.onrender.com`.

Plan notes:

- The API uses the **free** plan. Free services sleep after 15 minutes idle, and the first request then takes about 30 to 60 seconds. Upgrade to **starter** before judging starts.
- Render has **no free plan for background workers**. The worker is set to **starter** (paid, 512 MB). Since Prompt 37 it runs the pg-boss job loop; the steps that drive the old app arrive from Prompt 48, so until then it only marks steps "skipped".
- Worker memory, measured by `pnpm ci:local` (Docker smoke, `docker stats` while both are on the main menu): **2 Shifa emulators at once take 441 MiB** (Node, one Chromium headless shell, two js-dos pages; Docker Desktop on Windows, 19 Nov 2026). That leaves about 70 MB of the starter plan's 512 MB for the job loop and pg-boss, which is too little. Before possession runs in production (Prompt 48), either move the worker to **standard** (2 GB) or run one emulator at a time.
- The worker image is about 1.4 GB: Node 22 slim, Chromium's headless shell and its system libraries (installed by the lockfile's Playwright, `playwright install --with-deps --only-shell chromium`), and ClamAV with its signatures (Prompt 40).
- **Uploads are virus-scanned with ClamAV in the worker** (`clamscan`, `VIRUS_SCANNER=clamav`, the image default). Measured by the Docker smoke test: **a scan peaks at 1153 MiB**, because ClamAV loads all its signatures for each scan. The starter plan (512 MB) cannot scan an upload at all; the worker needs **standard** (2 GB) for uploads. The signatures are fetched when the image is built (`freshclam`), so redeploy now and then to refresh them. If the scanner cannot run, the scan fails and the upload is not used: nothing is let through unscanned.
- `VIRUS_SCANNER=eicar-test` swaps ClamAV for a test scanner that only finds the EICAR test file. It exists for machines without ClamAV (the e2e tests on Windows) and says "test scanner (EICAR only, not a real virus scan)" on every result. Never set it in production.

## 3. Vercel (web)

1. On vercel.com: **Add New → Project**, import the repo.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm, and installs from the repo root.
3. Add the environment variable `NEXT_PUBLIC_API_URL` = the Render API URL, for **Production** and **Preview**. It is inlined at build time, so redeploy after changing it.
4. Deploy. Then put the final Vercel URL into the API's `WEB_ORIGINS` on Render, or the browser blocks the health check (CORS).

## 4. Check it

- `https://<api>/health` returns `{"status":"ok","service":"afterlife-api",...}`.
- The web footer shows a green **API healthy** chip. Amber means `NEXT_PUBLIC_API_URL` is not set. Red means the API is down or `WEB_ORIGINS` does not include the web URL.
- Run `pnpm smoke:prod https://<vercel-url>`. It runs the Playwright tests tagged `@smoke` against production. (It replaces the `prod-smoke` workflow, because GitHub Actions is off.)

## Local checks before deploying

```bash
pnpm verify                                                     # lint, typecheck, tests, e2e
docker build -f apps/api/Dockerfile -t afterlife-api:local .
docker build -f apps/worker/Dockerfile -t afterlife-worker:local .
node scripts/docker-smoke.mjs                                   # /health, CORS, non-root, clean SIGTERM
```

`pnpm ci:local` runs the same Docker check when Docker is running.
