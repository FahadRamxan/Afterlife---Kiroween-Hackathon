import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createProject, getProject, isProjectId } from './projects';

const project = {
  id: '0192f5a0-1234-7abc-8def-0123456789ab',
  name: 'Shifa Medical Store',
  source: 'graveyard',
  sourceApp: 'shifa',
  status: 'created',
  mode: 'live',
  createdAt: '2026-11-18T10:00:00.000Z',
};
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    }),
  );

describe('isProjectId', () => {
  it('is true for a UUID and false for a Graveyard app id or a path trick', () => {
    expect(isProjectId(project.id)).toBe(true);
    expect(isProjectId(project.id.toUpperCase())).toBe(true);
    for (const s of ['shifa', '', '../etc', `${project.id}/x`]) expect(isProjectId(s)).toBe(false);
  });

  it('property: Graveyard ids (lower-case words) are never project ids', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9-]{0,30}$/), (s) => {
        expect(isProjectId(s)).toBe(false);
      }),
    );
  });
});

describe('createProject', () => {
  it('posts the Graveyard app and returns the new project', async () => {
    const fetcher = json(201, project);
    expect(await createProject('https://api.example/', 'shifa', fetcher)).toEqual({
      ok: true,
      project,
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/api/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ source: 'graveyard', app: 'shifa' }),
      }),
    );
  });

  it('says why it failed: unconfigured, down, rate limited, or the API message', async () => {
    expect(await createProject(undefined, 'shifa', vi.fn())).toEqual({
      ok: false,
      reason: 'unconfigured',
    });
    const down = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await createProject('https://a', 'shifa', down)).toEqual({ ok: false, reason: 'down' });
    expect(
      await createProject(
        'https://a',
        'shifa',
        json(429, { error: 'RATE_LIMITED', message: 'Try again in 1 minute.' }),
      ),
    ).toEqual({ ok: false, reason: 'rate-limited', message: 'Try again in 1 minute.' });
    expect(
      await createProject(
        'https://a',
        'doom',
        json(400, { error: 'BAD_PROJECT', message: 'app: Invalid option' }),
      ),
    ).toEqual({
      ok: false,
      reason: 'error',
      message: 'app: Invalid option',
    });
  });

  it('refuses an answer that is not a project (a proxy page, a wrong API)', async () => {
    expect(await createProject('https://a', 'shifa', json(201, { hello: 'world' }))).toEqual({
      ok: false,
      reason: 'error',
      message: 'The API answer was not a project',
    });
  });
});

describe('getProject', () => {
  it('returns the project and its timeline', async () => {
    const events = [
      { at: project.createdAt, kind: 'project_created', id: project.id, summary: project.name },
    ];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(project), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ projectId: project.id, events }), { status: 200 }),
      );
    expect(await getProject('https://a', project.id, fetcher)).toEqual({
      ok: true,
      project,
      events,
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `https://a/api/projects/${project.id}`,
      expect.anything(),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `https://a/api/projects/${project.id}/timeline`,
      expect.anything(),
    );
  });

  it('is "not-found" on 404, "down" on a network error', async () => {
    expect(
      await getProject(
        'https://a',
        project.id,
        json(404, { error: 'NOT_FOUND', message: 'No such project' }),
      ),
    ).toEqual({
      ok: false,
      reason: 'not-found',
    });
    expect(
      await getProject('https://a', project.id, vi.fn().mockRejectedValue(new TypeError('x'))),
    ).toEqual({
      ok: false,
      reason: 'down',
    });
  });
});
