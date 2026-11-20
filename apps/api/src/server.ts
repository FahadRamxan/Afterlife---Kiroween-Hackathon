import pino from 'pino';
import { buildApp } from './app';
import { parseEnv } from './env';
import { openStores } from './stores';

const env = parseEnv(process.env);
// The stores are opened (and the database migrated) before the app exists, so log with pino.
const { stores, close } = await openStores(env, pino({ level: env.LOG_LEVEL }));
const app = buildApp(env, {}, stores, {
  rateLimit: {
    perMinute: env.RATE_LIMIT_PER_MINUTE,
    createPerMinute: env.RATE_LIMIT_CREATE_PER_MINUTE,
  },
});

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
