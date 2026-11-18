import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import pkg from '../package.json' with { type: 'json' };
import { dbfInspectRoutes } from './dbf-inspect';
import type { Env } from './env';
import { MemorySessionStore, sessionRoutes, type SessionStore } from './sessions';

/** Builds the API without listening, so tests can use app.inject(). */
export type AppStores = { sessions?: SessionStore };

export function buildApp(env: Env, opts: FastifyServerOptions = {}, stores: AppStores = {}) {
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

  app.register(dbfInspectRoutes);
  app.register(sessionRoutes(stores.sessions ?? new MemorySessionStore()));
  return app;
}
