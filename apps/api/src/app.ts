import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import pkg from '../package.json' with { type: 'json' };
import type { Env } from './env';

/** Builds the API without listening, so tests can use app.inject(). */
export function buildApp(env: Env, opts: FastifyServerOptions = {}) {
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, ...opts });

  app.register(cors, { origin: env.WEB_ORIGINS, methods: ['GET', 'POST', 'DELETE'] });

  app.get('/health', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return {
      status: 'ok' as const,
      service: 'afterlife-api',
      version: pkg.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  });

  return app;
}
