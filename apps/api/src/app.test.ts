import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { parseEnv } from './env';

const app = buildApp(parseEnv({ WEB_ORIGINS: 'https://afterlife.example' }), { logger: false });

beforeAll(() => app.ready());
afterAll(() => app.close());

describe('GET /health', () => {
  it('returns ok with the service name, version and uptime', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json();
    expect(body).toMatchObject({ status: 'ok', service: 'afterlife-api' });
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});

describe('CORS', () => {
  it('allows the configured web origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://afterlife.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://afterlife.example');
  });

  it('does not allow other origins', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('unknown routes', () => {
  it('return a JSON 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Not Found' });
  });
});
