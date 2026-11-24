import { speechClientFrom } from '@afterlife/crew';
import pino from 'pino';
import { buildApp } from './app';
import { parseEnv } from './env';
import { openStores } from './stores';

const env = parseEnv(process.env);
// The stores are opened (and the database migrated) before the app exists, so log with pino.
const { stores, close } = await openStores(env, pino({ level: env.LOG_LEVEL }));
// Fails at start when the speech service is asked for but not set up (no bucket).
const speech = speechClientFrom(env);
const app = buildApp(
  env,
  {},
  { ...stores, speech },
  {
    rateLimit: {
      perMinute: env.RATE_LIMIT_PER_MINUTE,
      createPerMinute: env.RATE_LIMIT_CREATE_PER_MINUTE,
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app
      .close()
      .then(close)
      .then(() => process.exit(0));
  });
}

await app.listen({ port: env.PORT, host: env.HOST });
