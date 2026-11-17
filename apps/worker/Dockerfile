# Build from the repo root: docker build -f apps/worker/Dockerfile .
FROM node:22-slim
ENV NODE_ENV=production HUSKY=0 CI=true
RUN npm install -g pnpm@10.5.2
WORKDIR /app

# Install only this app and the workspace packages it depends on.
COPY . .
RUN pnpm install --frozen-lockfile --filter @afterlife/worker... \
  && chown -R node:node /app

USER node
WORKDIR /app/apps/worker

# Run node directly (not through pnpm) so SIGTERM reaches the app for a graceful shutdown.
CMD ["node", "--import", "tsx", "src/index.ts"]