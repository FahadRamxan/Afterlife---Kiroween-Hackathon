import { describe, expect, it, vi } from 'vitest';
import { checkApiHealth, healthUrl } from './api-status';

describe('healthUrl', () => {
  it('joins the base URL and /health without double slashes', () => {
    expect(healthUrl('https://api.example.com')).toBe('https://api.example.com/health');
    expect(healthUrl('https://api.example.com/')).toBe('https://api.example.com/health');
  });

  it('is null when the API URL is not configured', () => {
    expect(healthUrl(undefined)).toBeNull();
    expect(healthUrl('')).toBeNull();
  });
});

describe('checkApiHealth', () => {
  const ok = { status: 'ok', service: 'afterlife-api', version: '0.0.0', uptimeSeconds: 1 };

  it('is healthy when /health returns status ok', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(ok), { status: 200 }));
    expect(await checkApiHealth('https://api.example.com', fetcher)).toEqual({
      state: 'healthy',
      version: '0.0.0',
      storage: 'unknown',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('reads where the API keeps data; anything else (an older API) is "unknown"', async () => {
    const answer = (storage: unknown) =>
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...ok, storage }), { status: 200 }));
    expect(await checkApiHealth('https://a', answer('postgres'))).toMatchObject({
      storage: 'postgres',
    });
    expect(await checkApiHealth('https://a', answer('memory'))).toMatchObject({
      storage: 'memory',
    });
    expect(await checkApiHealth('https://a', answer('<b>x</b>'))).toMatchObject({
      storage: 'unknown',
    });
  });

  it('is down on a non-200, a wrong body, or a network error', async () => {
    const r500 = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const wrong = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: 'starting' }), { status: 200 }));
    const neterr = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect((await checkApiHealth('https://a', r500)).state).toBe('down');
    expect((await checkApiHealth('https://a', wrong)).state).toBe('down');
    expect((await checkApiHealth('https://a', neterr)).state).toBe('down');
  });

  it('is unconfigured when there is no API URL', async () => {
    const fetcher = vi.fn();
    expect((await checkApiHealth(undefined, fetcher)).state).toBe('unconfigured');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
