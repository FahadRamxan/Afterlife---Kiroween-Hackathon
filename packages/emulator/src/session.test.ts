import { renderScreen, type CellInput } from '@afterlife/screen';
import { describe, expect, it } from 'vitest';
import { buildBundle } from './bundle';
import { FakeEmulator } from './fake-emulator';
import { recordAction, type Observation } from './recorder';
import { MAX_SESSION_ACTIONS, ObservationSchema, SeanceSessionSchema } from './session';

function screen(title: string) {
  const cells: CellInput[][] = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: 80 }, () => ({ code: 0x20, fg: 15, bg: r === 0 ? 3 : 1 })),
  );
  [...title].forEach((ch, k) => (cells[0]![36 + k]!.code = ch.charCodeAt(0)));
  return renderScreen({ cellWidth: 8, cellHeight: 16, cells });
}

async function realObservation() {
  const emu = new FakeEmulator({ screen: screen('MAIN MENU') });
  await emu.boot(
    buildBundle({ executable: 'SHIFA.EXE', files: { 'SHIFA.EXE': new Uint8Array([0x4d, 0x5a]) } }),
  );
  return recordAction(emu, '2', { stableMs: 20, pollMs: 5 });
}

describe('ObservationSchema', () => {
  it('accepts what recordAction gives', async () => {
    const obs = await realObservation();
    expect(ObservationSchema.parse(obs)).toEqual(obs);
  });

  it.each([
    ['a bad fingerprint', (o: Observation) => (o.screenBefore.fingerprint = 'abc')],
    ['a negative duration', (o: Observation) => (o.durationMs = -1)],
    ['a screen of 26 rows', (o: Observation) => (o.screenAfter.text = new Array(26).fill(''))],
    ['a row longer than 80 columns', (o: Observation) => (o.screenAfter.text[0] = 'x'.repeat(81))],
    ['keys that are not a key sequence', (o: Observation) => (o.keys = '{Nope}')],
    [
      'a diff that is not a diff',
      (o: Observation) => (o.dbfDiff = { tables: 'all' } as unknown as Observation['dbfDiff']),
    ],
  ])('refuses %s', async (_label, spoil) => {
    const obs = structuredClone(await realObservation());
    spoil(obs);
    expect(ObservationSchema.safeParse(obs).success).toBe(false);
  });
});

describe('SeanceSessionSchema', () => {
  it('a séance: the app, when it started, its actions and an optional voice note', async () => {
    const obs = await realObservation();
    const session = {
      projectId: 'shifa',
      startedAt: '2026-11-18T10:00:00.000Z',
      actions: [obs, obs],
      audio: { mime: 'audio/webm', base64: 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYEC' },
    };
    expect(SeanceSessionSchema.parse(session)).toEqual(session);
    expect(SeanceSessionSchema.parse({ ...session, audio: undefined }).audio).toBeUndefined();
  });

  it.each([
    ['no actions', { actions: [] }],
    ['a project id with a path in it', { projectId: '../shifa' }],
    ['a start that is not a time', { startedAt: 'yesterday' }],
    ['audio that is not audio', { audio: { mime: 'text/html', base64: 'PGgxPg==' } }],
    ['audio that is not base64', { audio: { mime: 'audio/webm', base64: 'not base64!' } }],
  ])('refuses %s', async (_label, change) => {
    const obs = await realObservation();
    const session = {
      projectId: 'shifa',
      startedAt: '2026-11-18T10:00:00.000Z',
      actions: [obs],
      ...change,
    };
    expect(SeanceSessionSchema.safeParse(session).success).toBe(false);
  });

  it(`refuses more than ${MAX_SESSION_ACTIONS} actions`, async () => {
    const obs = await realObservation();
    const session = {
      projectId: 'shifa',
      startedAt: '2026-11-18T10:00:00.000Z',
      actions: new Array(MAX_SESSION_ACTIONS + 1).fill(obs),
    };
    expect(SeanceSessionSchema.safeParse(session).success).toBe(false);
  });
});
