// @spec ghost-twin#4.1 The Ghost Twin tab's data (Prompt 79): overview, feed, simulate, switch.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  candleOf,
  changesText,
  getTwin,
  getTwinEvents,
  newTwinToken,
  simulateDay,
  switchOver,
  TwinOverviewSchema,
} from './twin';
const ID = '0192b6a0-0000-7000-8000-000000000001';
const overview = {
  readiness: {
    days: 1,
    matched: 30,
    mismatched: 0,
    unknown: 2,
    pending: 0,
    ready: false,
    score: 14,
    reasons: ['6 more days of shadow use', '170 more matched transactions'],
    rule: { days: 7, matched: 200, openMismatches: 0 },
  },
  days: [{ date: '1998-07-15', total: 32, matched: 30, mismatched: 0, unknown: 2, pending: 0 }],
  primaryApp: 'old',
  switchedAt: null,
  hasToken: false,
  simulate: { available: true, nextDay: '1998-07-16', recordedDays: 7 },
};
afterEach(() => vi.unstubAllGlobals());
describe('the twin client', () => {
  it('reads the overview, and refuses one it cannot read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(overview))),
    );
    expect(await getTwin('http://api', ID)).toEqual({ ok: true, twin: overview });
    expect(TwinOverviewSchema.safeParse({ ...overview, primaryApp: 'ghost' }).success).toBe(false);
  });
  it('says when there is no API, or it cannot be reached', async () => {
    expect(await getTwin(undefined, ID)).toEqual({
      ok: false,
      message: 'No API is set up for this site',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    expect(await getTwin('http://api', ID)).toEqual({
      ok: false,
      message: 'The API cannot be reached',
    });
  });
  it('reads the feed after a seq', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            events: [
              {
                seq: 3,
                occurredAt: '1998-07-15T10:00:00.000Z',
                files: ['BILLS.DBF'],
                changes: { 'BILLS.DBF': { inserted: 1, updated: 0, deleted: 0 } },
                matched: true,
                oldResult: null,
                newResult: { outcome: 'matched', actionId: 'sale' },
              },
            ],
          }),
        ),
    );
    vi.stubGlobal('fetch', f);
    const r = await getTwinEvents('http://api/', ID, 2);
    expect(f).toHaveBeenCalledWith(`http://api/api/projects/${ID}/twin/events?after=2`);
    expect(r.ok && r.events[0]!.newResult).toEqual({ outcome: 'matched', actionId: 'sale' });
  });
  it('simulates a day, and passes on why it could not', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ day: '1998-07-16', events: 32 })));
    vi.stubGlobal('fetch', f);
    expect(await simulateDay('http://api', ID)).toEqual({
      ok: true,
      day: '1998-07-16',
      events: 32,
    });
    expect(f).toHaveBeenCalledWith(`http://api/api/projects/${ID}/twin/simulate`, {
      method: 'POST',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Every recorded day has been simulated' }), {
            status: 409,
          }),
      ),
    );
    expect(await simulateDay('http://api', ID)).toEqual({
      ok: false,
      message: 'Every recorded day has been simulated',
    });
  });
  it('switches over only with confirm: true in the body', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            primaryApp: 'vessel',
            switchedAt: '2026-11-23T10:00:00.000Z',
            migrated: { events: 224, files: ['MEDICINE.DBF'] },
          }),
        ),
    );
    vi.stubGlobal('fetch', f);
    const r = await switchOver('http://api', ID);
    expect(r).toMatchObject({ ok: true, primaryApp: 'vessel' });
    expect(f).toHaveBeenCalledWith(`http://api/api/projects/${ID}/twin/switch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
  });
});
describe('the shop PC token', () => {
  it('asks for a new one, shown once', async () => {
    const tok = 'tw_' + 'a'.repeat(43);
    const f = vi.fn(async () => new Response(JSON.stringify({ token: tok }), { status: 201 }));
    vi.stubGlobal('fetch', f);
    expect(await newTwinToken('http://api', ID)).toEqual({ ok: true, token: tok });
    expect(f).toHaveBeenCalledWith(`http://api/api/projects/${ID}/twin/token`, { method: 'POST' });
  });
});
describe('the candle of a day', () => {
  const day = (o: Partial<Record<'matched' | 'mismatched' | 'unknown' | 'pending', number>>) => {
    const d = { matched: 0, mismatched: 0, unknown: 0, pending: 0, ...o };
    return { date: '1998-07-15', total: d.matched + d.mismatched + d.unknown + d.pending, ...d };
  };
  it('is matched only when every transaction matched; a mismatch makes it red', () => {
    expect(candleOf(day({ matched: 32 }))).toBe('matched');
    expect(candleOf(day({ matched: 31, mismatched: 1 }))).toBe('mismatched');
    expect(candleOf(day({ matched: 30, pending: 2 }))).toBe('pending');
    expect(candleOf(day({ matched: 30, unknown: 2 }))).toBe('unknown');
    expect(candleOf(day({ mismatched: 1, pending: 3 }))).toBe('mismatched');
  });
});
describe('the old side of a twin pair', () => {
  it('says what the old app wrote in each file', () => {
    expect(
      changesText({
        'BILLS.DBF': { inserted: 1, updated: 0, deleted: 0 },
        'MEDICINE.DBF': { inserted: 0, updated: 2, deleted: 0 },
        'SAME.DBF': { inserted: 0, updated: 0, deleted: 0 },
      }),
    ).toBe('BILLS.DBF +1 · MEDICINE.DBF ~2');
    expect(changesText({})).toBe('no change');
  });
});
