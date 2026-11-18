import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_EVENTS,
  latestScreen,
  liveUrl,
  mergeEvents,
  reconnectDelay,
  type LiveEvent,
} from './live';

const ev = (seq: number, type = 'log', payload: unknown = {}): LiveEvent => ({
  seq,
  type,
  payload,
  at: '2026-11-19T10:00:00.000Z',
});

describe('liveUrl', () => {
  it('turns the API URL into the WebSocket URL, with ?after= when resuming', () => {
    const id = '0192f5a0-1234-7abc-8def-0123456789ab';
    expect(liveUrl('http://localhost:4000', id)).toBe(
      `ws://localhost:4000/api/projects/${id}/live`,
    );
    expect(liveUrl('https://api.example/', id, 42)).toBe(
      `wss://api.example/api/projects/${id}/live?after=42`,
    );
  });
});

describe('mergeEvents', () => {
  const seqs = fc.array(fc.integer({ min: 1, max: 600 }), { maxLength: 300 });

  it('property: sorted by seq, no duplicates, at most the last 200, and nothing new is lost', () => {
    fc.assert(
      fc.property(seqs, seqs, (a, b) => {
        const merged = mergeEvents(
          mergeEvents(
            [],
            a.map((s) => ev(s)),
          ),
          b.map((s) => ev(s)),
        );
        const out = merged.map((e) => e.seq);
        expect(out).toEqual([...out].sort((x, y) => x - y));
        expect(new Set(out).size).toBe(out.length);
        expect(out.length).toBeLessThanOrEqual(MAX_EVENTS);
        const all = [...new Set([...a, ...b])].sort((x, y) => x - y);
        expect(out).toEqual(all.slice(-MAX_EVENTS));
      }),
    );
  });

  it('a replay after a reconnect that repeats events changes nothing', () => {
    const once = mergeEvents([], [ev(1), ev(2), ev(3)]);
    expect(mergeEvents(once, [ev(2), ev(3)])).toEqual(once);
  });
});

describe('latestScreen', () => {
  it('is the newest screen event, or null', () => {
    expect(latestScreen([ev(1), ev(2)])).toBeNull();
    const s = latestScreen([ev(1, 'screen', { n: 1 }), ev(2), ev(3, 'screen', { n: 2 }), ev(4)]);
    expect(s).toMatchObject({ seq: 3, payload: { n: 2 } });
  });
});

describe('reconnectDelay', () => {
  it('backs off from 500 ms to at most 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(reconnectDelay)).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000,
    ]);
  });
});
