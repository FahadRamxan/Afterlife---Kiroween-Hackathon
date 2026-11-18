import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import pkg from '../package.json' with { type: 'json' };
import { dbfInspectRoutes } from './dbf-inspect';
import type { Env } from './env';
import { MemoryProjectStore, projectRoutes, type ProjectStore } from './projects';
import { MemorySessionStore, sessionRoutes, type SessionStore } from './sessions';

export type AppStores = { sessions?: SessionStore; projects?: ProjectStore };

export type AppOptions = {
  /**
   * Requests per minute per IP address. Judges use the site without logging in, so this is what
   * stops one address from filling the database. Raising (POST /api/projects) has its own,
   * lower limit.
   */
  rateLimit?: { perMinute: number; createPerMinute: number };
};

export const DEFAULT_RATE_LIMIT = { perMinute: 300, createPerMinute: 20 };

/** Builds the API without listening, so tests can use app.inject(). */
export function buildApp(
  env: Env,
  opts: FastifyServerOptions = {},
  stores: AppStores = {},
  appOptions: AppOptions = {},
) {
  // Behind Render's proxy the client's address is in X-Forwarded-For (TRUST_PROXY=1).
  const app = Fastify({ logger: { level: env.LOG_LEVEL }, trustProxy: env.TRUST_PROXY, ...opts });
  const sessions = stores.sessions ?? new MemorySessionStore();
  const projects = stores.projects ?? new MemoryProjectStore();
  const limits = appOptions.rateLimit ?? DEFAULT_RATE_LIMIT;

  // Routes with a zod schema are validated and serialized by it (and documented from it).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: env.WEB_ORIGINS, methods: ['GET', 'POST', 'DELETE'] });
  app.register(rateLimit, {
    global: true,
    max: limits.perMinute,
    timeWindow: '1 minute',
    // Thrown as the error; the routes send it as `{error, message}` with status 429.
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'RATE_LIMITED',
      message: `Too many requests from your address. Try again in ${ctx.after}.`,
    }),
  });
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Afterlife API',
        description: 'Raise dead DOS business apps: projects, séances and the DBF inspector.',
        version: pkg.version,
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  app.register(swaggerUi, { routePrefix: '/api/docs' });

  app.register(async (scope) => {
    // Uptime checks and the footer chip poll this: never rate limited.
    scope.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
      reply.header('cache-control', 'no-store');
      return {
        status: 'ok' as const,
        service: 'afterlife-api',
        version: pkg.version,
        uptimeSeconds: Math.round(process.uptime()),
        storage: sessions.kind,
      };
    });
    scope.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger());
  });

  app.register(dbfInspectRoutes);
  app.register(sessionRoutes(sessions));
  app.register(projectRoutes(projects, { createPerMinute: limits.createPerMinute }));
  return app;
}
