// Prompt 36: the projects API, through app.inject() on the memory store.
import { SEED_PROJECTS, uuidv7 } from '@afterlife/db';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppOptions } from './app';
import { parseEnv } from './env';
import { projectStoreContract } from './projects-contract';
import { MemoryProjectStore } from './projects';

// Each test builds a whole app (swagger, rate limiter); in the pre-commit run on a loaded machine
// one took over 5 s.
vi.setConfig({ testTimeout: 20_000 });

projectStoreContract('memory', () => new MemoryProjectStore());

const apps: ReturnType<typeof buildApp>[] = [];
function app(opts: AppOptions = {}) {
  const a = buildApp(
    parseEnv({ WEB_ORIGINS: 'https://afterlife.example' }),
    { logger: false },
    {},
    opts,
  );
  apps.push(a);
  return a;
}
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});

const raise = (a: ReturnType<typeof app>, body: unknown, ip?: string) =>
  a.inject({ method: 'POST', url: '/api/projects', payload: body as object, remoteAddress: ip });

describe('POST /api/projects', () => {
  it('raises a Graveyard app: 201 with the new project, named after the app', async () => {
    const a = app();
    const res = await raise(a, { source: 'graveyard', app: 'shifa' });
    expect(res.statusCode).toBe(201);
    const p = res.json();
    expect(p).toMatchObject({
      name: 'Shifa Medical Store',
      source: 'graveyard',
      sourceApp: 'shifa',
      status: 'created',
    });
    expect(res.headers.location).toBe(`/api/projects/${p.id}`);
  });

  it('refuses an app that is not in the Graveyard, and a body that is not a project, with 400', async () => {
    const a = app();
    for (const body of [
      { source: 'graveyard', app: 'doom' },
      { source: 'graveyard' },
      { source: 'floppy', app: 'shifa' },
      { source: 'graveyard', app: 'shifa', extra: '<script>' },
      [],
    ]) {
      const res = await raise(a, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error).toBe('BAD_PROJECT');
      expect(res.json().message).not.toContain('<script>');
    }
    const json = await a.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { 'content-type': 'application/json' },
      payload: '"shifa"',
    });
    expect(json.statusCode).toBe(400);
    expect(json.json().error).toBe('BAD_PROJECT');
  });

  it('a body that is not JSON is 415, in the same {error, message} shape', async () => {
    const res = await raise(app(), 'shifa');
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ error: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('a raise is live unless it asks for a recorded run (demo mode)', async () => {
    const a = app();
    expect((await raise(a, { source: 'graveyard', app: 'shifa' })).json().mode).toBe('live');
    const rec = await raise(a, { source: 'graveyard', app: 'shifa', mode: 'recorded' });
    expect(rec.statusCode).toBe(201);
    expect(rec.json().mode).toBe('recorded');
    expect((await raise(a, { source: 'graveyard', app: 'shifa', mode: 'fake' })).statusCode).toBe(
      400,
    );
  });

  it('without a database there is no pipeline: steps answer 503, saying why', async () => {
    const a = app();
    const p = (await raise(a, { source: 'graveyard', app: 'shifa' })).json();
    for (const [method, url] of [
      ['GET', `/api/projects/${p.id}/steps`],
      ['POST', `/api/projects/${p.id}/steps/possess/run`],
    ] as const) {
      const res = await a.inject({ method, url });
      expect(res.statusCode, url).toBe(503);
      expect(res.json().error).toBe('NO_DATABASE');
    }
    expect(
      (await a.inject({ method: 'POST', url: `/api/projects/${p.id}/steps/twin-replay/run` }))
        .statusCode,
    ).toBe(400);
  });

  it('an upload is not raised yet (Prompt 40): 501, saying so', async () => {
    const res = await raise(app(), { source: 'upload', uploadId: uuidv7() });
    expect(res.statusCode).toBe(501);
    expect(res.json()).toMatchObject({ error: 'NOT_YET' });
  });
});

describe('GET /api/projects/:id and /timeline', () => {
  it('gives the project and its timeline back', async () => {
    const a = app();
    const p = (await raise(a, { source: 'graveyard', app: 'iqra' })).json();
    const got = await a.inject({ method: 'GET', url: `/api/projects/${p.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual(p);
    const tl = await a.inject({ method: 'GET', url: `/api/projects/${p.id}/timeline` });
    expect(tl.statusCode).toBe(200);
    expect(tl.json()).toEqual({
      projectId: p.id,
      events: [expect.objectContaining({ kind: 'project_created' })],
    });
  });

  it('answers 404 for an unknown id and 400 for something that is not an id', async () => {
    const a = app();
    for (const url of [`/api/projects/${uuidv7()}`, `/api/projects/${uuidv7()}/timeline`])
      expect((await a.inject({ method: 'GET', url })).json()).toMatchObject({ error: 'NOT_FOUND' });
    for (const url of ['/api/projects/shifa', '/api/projects/..%2Fetc/timeline']) {
      const res = await a.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(400);
      expect(res.json().error).toBe('BAD_ID');
    }
  });
});

describe('DELETE /api/projects/:id', () => {
  it('deletes a project: 204, then 404', async () => {
    const a = app();
    const p = (await raise(a, { source: 'graveyard', app: 'barkat' })).json();
    expect((await a.inject({ method: 'DELETE', url: `/api/projects/${p.id}` })).statusCode).toBe(
      204,
    );
    expect((await a.inject({ method: 'GET', url: `/api/projects/${p.id}` })).statusCode).toBe(404);
    expect((await a.inject({ method: 'DELETE', url: `/api/projects/${p.id}` })).statusCode).toBe(
      404,
    );
  });

  it('refuses to delete the seeded Graveyard projects (403): every judge shares them', async () => {
    const res = await app().inject({
      method: 'DELETE',
      url: `/api/projects/${SEED_PROJECTS[0].id}`,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('PROTECTED');
  });
});

describe('per-IP rate limits for anonymous judges', () => {
  it('raising is limited per IP: over the limit is 429 with a reason, another IP is not affected', async () => {
    const a = app({ rateLimit: { perMinute: 100, createPerMinute: 3 } });
    for (let i = 0; i < 3; i++)
      expect((await raise(a, { source: 'graveyard', app: 'shifa' }, '10.0.0.1')).statusCode).toBe(
        201,
      );
    const over = await raise(a, { source: 'graveyard', app: 'shifa' }, '10.0.0.1');
    expect(over.statusCode).toBe(429);
    expect(over.json()).toMatchObject({ error: 'RATE_LIMITED' });
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
    expect((await raise(a, { source: 'graveyard', app: 'shifa' }, '10.0.0.2')).statusCode).toBe(
      201,
    );
  });

  it('every API route has a per-IP limit, but /health never does (uptime checks poll it)', async () => {
    const a = app({ rateLimit: { perMinute: 2, createPerMinute: 2 } });
    const id = uuidv7();
    const codes = [];
    for (let i = 0; i < 3; i++)
      codes.push(
        (await a.inject({ method: 'GET', url: `/api/projects/${id}`, remoteAddress: '10.0.0.3' }))
          .statusCode,
      );
    expect(codes).toEqual([404, 404, 429]);
    for (let i = 0; i < 5; i++)
      expect(
        (await a.inject({ method: 'GET', url: '/health', remoteAddress: '10.0.0.3' })).statusCode,
      ).toBe(200);
  });
});

describe('OpenAPI', () => {
  it('documents the projects routes with their bodies and answers', async () => {
    const a = app();
    const res = await a.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json();
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/api/projects',
        '/api/projects/{id}',
        '/api/projects/{id}/timeline',
      ]),
    );
    const post = doc.paths['/api/projects'].post;
    expect(JSON.stringify(post.requestBody)).toContain('graveyard');
    expect(Object.keys(post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '429', '501']),
    );
    expect(Object.keys(doc.paths['/api/projects/{id}'])).toEqual(
      expect.arrayContaining(['get', 'delete']),
    );
  });

  it('serves the interactive docs page', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/docs/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
