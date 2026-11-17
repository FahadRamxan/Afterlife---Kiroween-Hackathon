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
2. Copy two connection strings from **Connection details**:
   - the **pooled** one (host contains `-pooler`) for the API and worker
   - the **direct** one for migrations (used from Prompt 35)
3. Keep `?sslmode=require` on both.

## 2. Render (API and worker)

`render.yaml` is a Blueprint for both services.

1. On render.com: **New → Blueprint**, connect the GitHub repo, pick the `main` branch. Render reads `render.yaml`.
2. Render asks for the `sync: false` values:
   - `afterlife-api`: `WEB_ORIGINS` = the Vercel URL (step 3), for example `https://afterlife.vercel.app`. Comma-separate several. `DATABASE_URL` = the Neon pooled URL.
   - `afterlife-worker`: `DATABASE_URL` = the Neon pooled URL.
3. Render builds each Dockerfile from the repo root. The API health check is `GET /health`. A deploy only goes live once it returns 200.
4. Note the API URL, for example `https://afterlife-api.onrender.com`.

Plan notes:

- The API uses the **free** plan. Free services sleep after 15 minutes idle, and the first request then takes about 30 to 60 seconds. Upgrade to **starter** before judging starts.
- Render has **no free plan for background workers**. The worker is set to **starter** (paid). It only logs a heartbeat until Prompt 37, so you can skip creating it until then.

## 3. Vercel (web)

1. On vercel.com: **Add New → Project**, import the repo.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and pnpm, and installs from the repo root.
3. Add the environment variable `NEXT_PUBLIC_API_URL` = the Render API URL, for **Production** and **Preview**. It is inlined at build time, so redeploy after changing it.
4. Deploy. Then put the final Vercel URL into the API's `WEB_ORIGINS` on Render, or the browser blocks the health check (CORS).

## 4. Check it

- `https://<api>/health` returns `{"status":"ok","service":"afterlife-api",...}`.
- The web footer shows a green **API healthy** chip. Amber means `NEXT_PUBLIC_API_URL` is not set. Red means the API is down or `WEB_ORIGINS` does not include the web URL.
- Run the **Prod smoke** workflow (`.github/workflows/prod-smoke.yml`): GitHub → Actions → Prod smoke → Run workflow, with the Vercel URL. It runs the Playwright tests tagged `@smoke` against production.

## Local checks before deploying

```bash
pnpm verify                                                     # lint, typecheck, tests, e2e
docker build -f apps/api/Dockerfile -t afterlife-api:local .
docker build -f apps/worker/Dockerfile -t afterlife-worker:local .
node scripts/docker-smoke.mjs                                   # /health, CORS, non-root, clean SIGTERM
```

CI runs the same Docker check in the `docker` job.
