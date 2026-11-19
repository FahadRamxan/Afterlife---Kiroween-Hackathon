// Prompt 50: guided possession. A séance saved on the project leads the Possessor, and the
// owner's voice note becomes hints on the actions it was spoken over (fake speech service).
import { FakeSpeechClient } from '@afterlife/crew';
import { observations, projects, sessions, eq, and, isNotNull } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { recordAction, type EmulatorController } from '@afterlife/emulator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootMiniShop } from '../../../packages/crew/src/possessor/testing/mini-shop';
import { possessApp } from './possess';
import type { StepContext } from './registry';

const FAST = { stableMs: 1, pollMs: 1, maxWaitMs: 50 };
const shop = {
  async use<R>(_b: Uint8Array, work: (emu: EmulatorController) => Promise<R>) {
    return work((await bootMiniShop()).emu);
  },
};

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

/** A project with the owner's séance on it: Items, A, a name, a price, one key a second. */
async function projectWithSeance(audio: boolean) {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Mini shop', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  const owner = await bootMiniShop();
  const keys = ['2', 'A', ...'TAPAL CHAI', '{Enter}', ...'45', '{Enter}'];
  const recorded = [];
  for (const k of keys) recorded.push(await recordAction(owner.emu, k, FAST));
  const [s] = await t.db
    .insert(sessions)
    .values({
      app: 'shifa',
      projectId: p!.id,
      startedAt: new Date('1998-07-15T10:00:00Z'),
      ...(audio ? { audioMime: 'audio/webm', audio: new Uint8Array([1, 2, 3]) } : {}),
    })
    .returning();
  await t.db.insert(observations).values(
    recorded.map((o, seq) => ({
      sessionId: s!.id,
      seq,
      keys: o.keys,
      screenBeforeFp: o.screenBefore.fingerprint,
      screenAfterFp: o.screenAfter.fingerprint,
      screenBefore: o.screenBefore,
      screenAfter: o.screenAfter,
      dbfDiff: o.dbfDiff,
      durationMs: o.durationMs,
      stable: o.stable,
      offsetMs: seq * 1000,
    })),
  );
  return { projectId: p!.id, sessionId: s!.id, keys };
}

function ctx(projectId: string) {
  const events: { type: string; payload: Record<string, unknown> }[] = [];
  const c: StepContext = {
    projectId,
    project: { name: 'Mini shop', source: 'graveyard', sourceApp: 'shifa', dosTime: null },
    step: 'possess',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) =>
      void events.push({ type, payload: payload as Record<string, unknown> }),
    log: async (message) => void events.push({ type: 'log', payload: { message } }),
  };
  return { c, events };
}

const handler = (speech: FakeSpeechClient | null) =>
  possessApp({
    pool: shop,
    bundleFor: () => new Uint8Array([1]),
    db: t.db,
    speech,
    record: FAST,
    maxActions: 120,
  });

describe('guided possession on the worker', () => {
  it("walks the owner's séance first, saves at its step 4, and keeps the voice note as hints", async () => {
    const { projectId, sessionId } = await projectWithSeance(true);
    // Said over "2" (ends 0.5 s), over "A" (ends 1.5 s) and while typing the price (ends 13.5 s).
    const speech = new FakeSpeechClient({
      language: 'ur-PK',
      text: 'yeh items hain. naya item. qeemat pentalees',
      segments: [
        { startMs: 200, endMs: 500, text: 'yeh items hain.' },
        { startMs: 1200, endMs: 1500, text: 'naya item.' },
        { startMs: 12000, endMs: 13500, text: 'qeemat pentalees' },
      ],
    });
    const { c, events } = ctx(projectId);
    const r = await handler(speech)(c);
    expect(r).toMatchObject({
      status: 'done',
      output: { guided: { seances: 1, steps: 4, hints: 3, notes: { transcribed: 1 } } },
    });
    expect(speech.calls).toEqual([{ bytes: 3, mime: 'audio/webm', languages: ['ur-PK', 'en-US'] }]);
    const obs = events.filter((e) => e.type === 'observation').map((e) => e.payload);
    expect(obs.slice(0, 4).map((o) => [o.kind, o.keys, o.hint])).toEqual([
      ['guide', '2', 'yeh items hain.'],
      ['guide', 'A', 'naya item.'],
      ['guide', 'TAPAL CHAI{Enter}', undefined],
      ['guide', '45{Enter}', 'qeemat pentalees'],
    ]);
    expect(obs[3]!.changed).toEqual(['ITEMS.DBF']);
    // The séance's own actions keep the hints, for the Archaeologist.
    const hinted = await t.db
      .select({ seq: observations.seq, hint: observations.hint })
      .from(observations)
      .where(and(eq(observations.sessionId, sessionId), isNotNull(observations.hint)));
    expect(hinted.sort((a, b) => a.seq - b.seq)).toEqual([
      { seq: 0, hint: { text: 'yeh items hain.', language: 'ur-PK', provider: 'fake' } },
      { seq: 1, hint: { text: 'naya item.', language: 'ur-PK', provider: 'fake' } },
      // Ended at 13.5 s: on the "4" of the price, pressed at 13 s (one key a second from 0).
      { seq: 13, hint: { text: 'qeemat pentalees', language: 'ur-PK', provider: 'fake' } },
    ]);
    const logs = events.filter((e) => e.type === 'log').map((e) => e.payload.message);
    expect(logs).toContain('Guided by the owner’s séance: 4 steps first, then the gaps');
    expect(logs).toContain('Voice notes transcribed: 1, giving 3 hints');

    // A re-run does not transcribe again: the hints are kept.
    const again = await handler(speech)(ctx(projectId).c);
    expect(speech.calls).toHaveLength(1);
    expect(again).toMatchObject({ output: { guided: { hints: 3, notes: { reused: 1 } } } });
  }, 60_000);

  it('without a speech service it says the voice note was not transcribed, and still follows the path', async () => {
    const { projectId } = await projectWithSeance(true);
    const { c, events } = ctx(projectId);
    const r = await handler(null)(c);
    expect(r).toMatchObject({
      output: { guided: { steps: 4, hints: 0, notes: { untranscribed: 1 } } },
    });
    const logs = events.filter((e) => e.type === 'log').map((e) => e.payload.message);
    expect(logs).toContain('1 voice note was not transcribed: no speech service is set up');
    const first = events.find((e) => e.type === 'observation')!.payload;
    expect(first).toMatchObject({ kind: 'guide', keys: '2' });
    expect(first).not.toHaveProperty('hint');
  }, 60_000);

  it('a project with no séance explores blind', async () => {
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Blind', source: 'graveyard', sourceApp: 'shifa' })
      .returning();
    const { c, events } = ctx(p!.id);
    const r = await handler(null)(c);
    expect(r).toMatchObject({ output: { guided: { seances: 0, steps: 0 } } });
    expect(
      events.filter((e) => e.type === 'observation').every((e) => e.payload.kind !== 'guide'),
    ).toBe(true);
  }, 60_000);
});
