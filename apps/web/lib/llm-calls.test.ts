import { describe, expect, it, vi } from 'vitest';
import { getLlmCall, getLlmCalls } from './llm-calls';

const id = '0192f5a0-1234-7abc-8def-0123456789ab';
const call = {
  id: '0192f5a0-1234-7abc-8def-0123456789ac',
  at: '2026-11-01T10:00:00.000Z',
  agent: 'possessor',
  purpose: 'a quantity',
  provider: 'fake',
  model: 'fake-model',
  attempt: 1,
  status: 'invalid',
  inputTokens: 100,
  outputTokens: 20,
  durationMs: 800,
  error: 'quantity: expected number',
};
const json = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('getLlmCalls', () => {
  it('reads the calls and the budget', async () => {
    const list = { budget: { tokens: 5000, used: 120 }, total: 1, calls: [call] };
    const f = json(200, { projectId: id, ...list });
    // An old API without "bodies": they are shown.
    expect(await getLlmCalls('https://a/', id, f)).toEqual({
      ok: true,
      list: { ...list, bodies: 'shown' },
    });
    const shop = json(200, { projectId: id, ...list, bodies: 'hidden' });
    expect(await getLlmCalls('https://a/', id, shop)).toMatchObject({ list: { bodies: 'hidden' } });
    expect(f).toHaveBeenCalledWith(`https://a/api/projects/${id}/llm-calls`, expect.anything());
  });
  it('says why it cannot', async () => {
    expect(await getLlmCalls(undefined, id)).toEqual({ ok: false, reason: 'unconfigured' });
    expect(await getLlmCalls('https://a', id, json(503, { message: 'no db' }))).toEqual({
      ok: false,
      reason: 'error',
      message: 'no db',
    });
    expect(await getLlmCalls('https://a', id, json(200, { calls: 'x' }))).toMatchObject({
      reason: 'error',
      message: 'The API answer was not a list of model calls',
    });
    const down = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await getLlmCalls('https://a', id, down)).toEqual({ ok: false, reason: 'down' });
  });
});

describe('getLlmCall', () => {
  it('reads one call with its request and response', async () => {
    const f = json(200, { ...call, request: { messages: [] }, response: null });
    const r = await getLlmCall('https://a', id, call.id, f);
    expect(r).toMatchObject({ ok: true, call: { id: call.id, request: { messages: [] } } });
    expect(f).toHaveBeenCalledWith(
      `https://a/api/projects/${id}/llm-calls/${call.id}`,
      expect.anything(),
    );
  });
});
