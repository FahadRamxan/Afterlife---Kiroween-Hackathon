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
- **The language model is Claude Sonnet on Amazon Bedrock** (Prompt 47). On the worker set `LLM_PROVIDER=bedrock`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (an IAM user allowed only `bedrock:InvokeModel` on the Sonnet model and its inference profile), and `AWS_REGION` (default `us-east-1`). The model id defaults to `us.anthropic.claude-sonnet-5-5`, the US inference profile of Claude Sonnet 5.5 (Bedrock serves it only through inference profiles; `global.anthropic.claude-sonnet-5-5` routes worldwide). Set `BEDROCK_MODEL_ID` for another one. What each model accepts is a table by family (`BEDROCK_MODEL_TABLE` in `packages/crew/src/llm/bedrock.ts`): Sonnet 5.5 and later, and Fable 5.1 and 5.2, refuse a forced tool choice and any temperature; Sonnet 5, Opus 4.7, 4.8 and 5 refuse a temperature; older Sonnet, Opus and Haiku models take both. A model the table does not list is treated as strict. When the worker cannot force the tool, it asks the model to answer with it, and an answer in words is refused and asked again. Sonnet 4.5, the default before, retires. Names, phone numbers, addresses and CNICs from the app are masked before anything is sent to the model, and the model calls of an uploaded app (a real shop) are listed on the page without what was sent or answered. Model access must be enabled in the Bedrock console first. Without `LLM_PROVIDER` the worker runs with no model, and the jobs that need one (the Urdu translation) fail and say so. `LLM_TOKEN_BUDGET` (default 200,000) caps the tokens one project may use; set the same number on the API, which shows it.
- **Or the Claude API** (Prompt 80a), the same Claude models with an Anthropic API key instead of AWS: on the worker set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (secret, `sync: false` in `render.yaml`; never logged). `ANTHROPIC_MODEL_ID` changes the model (default `claude-sonnet-5-5`). The client asks for the server-side fallback, so a model that declines for policy reasons hands over to another; a refusal or a reply cut off with nothing in it is an error, never empty text. Locally, put the settings in `apps/worker/.env`: the worker and the API now load their `.env` when it exists (`tsx --env-file-if-exists=.env`). `pnpm llm:smoke` makes one tiny call to check the key, and skips without one.
- **Speech to text is Amazon Transcribe** (Prompt 80), for spoken rule changes (API) and séance voice notes (worker). Set `SPEECH_PROVIDER=transcribe`, `TRANSCRIBE_BUCKET` (an S3 bucket in `AWS_REGION`; each recording stays there only until it is transcribed, then it, its transcript file and the job are deleted) and the AWS credentials, on both. The IAM user needs `transcribe:StartTranscriptionJob`, `GetTranscriptionJob`, `DeleteTranscriptionJob`, and `s3:PutObject`, `GetObject`, `DeleteObject` on that bucket's `afterlife/voice/` prefix. Transcribe has no Urdu: spoken Urdu is sent as Hindi (`hi-IN`), the closest language it has, and comes back in Devanagari; the normaliser reads its numbers. `SPEECH_FALLBACK_REGION` with `TRANSCRIBE_FALLBACK_BUCKET` adds a second region, tried when the first fails. Unset or `none`: no speech service; the Living Soul tab still takes typed changes and says so.
- **Possession** (Prompts 48 to 50): `POSSESS_MAX_ACTIONS` (default 120) caps the key sequences per possession, and `POSSESS_PROBES` (default 3) how many values the Possessor types into each field. A full possession of Shifa takes about 50 actions and under a minute on the worker.
- **The proof** (Prompt 70): `PROVE_CASES` (default 50) cases per proof, on `PROVE_LANES` (default 2) emulators at once. A case on the real app takes about 5 s, so 50 cases take about 2 minutes, plus up to a minute shrinking the first difference. Keep `PROVE_LANES` at or below `JSDOS_POOL_SIZE`.
- **The Rebirth Certificate** (Prompt 71): run `pnpm cert:key` once. Put `CERT_SIGNING_KEY` (the secret) on the worker only, as a Render secret, and `CERT_PUBLIC_KEY` on the API, which publishes it at `/.well-known/afterlife-key`. The worker signs a certificate after a proof with no difference of a Soul whose data was migrated and reconciled; without the key it proves but issues none and logs why. Never use the e2e run's key (RFC 8032's published test key) in production. Changing the key makes every certificate issued before it fail to verify against the new published key.
- **Séance voice notes** are transcribed into hints only when a speech service is set up. `SPEECH_PROVIDER=none` is the only choice for now: the Amazon Transcribe client is not built yet (its batch API needs an S3 bucket for the audio). Without it the worker logs that the voice notes were not transcribed, and guided possession still follows the séance's keys.

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
