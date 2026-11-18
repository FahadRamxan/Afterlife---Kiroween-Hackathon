import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @afterlife/db generate` writes the next up migration from src/schema.ts.
// Write its .down.sql by hand next to it (src/migrate.test.ts fails if one is missing).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
});
