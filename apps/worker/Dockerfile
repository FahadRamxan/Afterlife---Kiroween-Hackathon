# Build from the repo root: docker build -f apps/worker/Dockerfile .
# The worker runs js-dos in headless Chromium (HeadlessPool), so the image carries Chromium's
# headless shell and its system libraries, installed by the same Playwright version as the
# lockfile. (The official Playwright image ships Node 26; we stay on Node 22 LTS.)
# It also virus-scans uploaded apps with ClamAV (Prompt 40); the signatures are fetched at build
# time, so rebuild the image to update them.
FROM node:22-bookworm-slim
ENV NODE_ENV=production HUSKY=0 CI=true PLAYWRIGHT_BROWSERS_PATH=/ms-playwright VIRUS_SCANNER=clamav
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav ca-certificates \
  && freshclam --stdout --no-warnings \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.5.2
WORKDIR /app
# Install only this app and the workspace packages it depends on.
COPY . .
RUN pnpm install --frozen-lockfile --filter @afterlife/worker... \
  && pnpm --filter @afterlife/worker exec playwright install --with-deps --only-shell chromium \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /app /ms-playwright
USER node
WORKDIR /app/apps/worker
# Run node directly (not through pnpm) so SIGTERM reaches the app for a graceful shutdown.
CMD ["node", "--import", "tsx", "src/index.ts"]
