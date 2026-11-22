// @spec exorcist#1.3 The exorcise step (Prompt 73): the newest Soul, the project's observations and
// the old app's records; the late fee probes typed into the old app; a row and an event per finding.
import { recordedInput } from '@afterlife/crew/exorcist/testing';
import type { SnapshotDiff } from '@afterlife/dbf';
import { eq, exorcisms, insertSoulVersion, observations, projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exorciseStep, type ProbeTyper } from './exorcise-step';
import { graveyardBundle } from './possess';
import type { StepContext } from './registry';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

/** A project of a sample app with its recorded run's Soul and observations. */
async function project(app: 'shifa' | 'iqra' | 'barkat', soul?: Soul | null) {
  const input = recordedInput(app);
  const [p] = await t.db
    .insert(projects)
    .values({ name: app, source: 'graveyard', sourceApp: app })
    .returning();
  if (soul !== null)
    await insertSoulVersion(t.db, p!.id, (v, parent) => {
      const s = numberSoul(soul ?? input.soul, p!.id, v, parent);
      return { ir: s, specMarkdown: specRequirements(s) };
    });
  await t.db.insert(observations).values(
    input.observations.map((o, i) => ({
      projectId: p!.id,
      seq: i + 1,
      keys: o.keys,
      screenBeforeFp: 'fp_0000000000000000',
      screenAfterFp: 'fp_0000000000000000',
      screenBefore: o.screenBefore,
      screenAfter: o.screenAfter,
      dbfDiff: o.dbfDiff,
      durationMs: 1,
      stable: true,
    })),
  );
  return p!;
}
function ctx(p: { id: string; sourceApp: string }) {
  const logs: string[] = [];
  const events: [string, Record<string, unknown>][] = [];
  const c: StepContext = {
    projectId: p.id,
    project: { name: p.sourceApp, source: 'graveyard', sourceApp: p.sourceApp, dosTime: null },
    step: 'exorcise',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => void events.push([type, payload as Record<string, unknown>]),
    log: async (m) => void logs.push(m),
  };
  return { c, logs, events };
}

/** The 2001 app's late fee: Rs 50 per calendar week (Monday to Sunday) crossed after the 10th. */
const calendarWeeks: ProbeTyper = async (_soul, _c, dosTime) => {
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
  const week = (d: number) => Math.floor((d + 3) / 7);
  const weeks = Math.max(0, week(day(dosTime)) - week(day('2001-03-10')));
  const diff: SnapshotDiff = {
    tables: {
      'PAYMENT.DBF': {
        key: 'RECEIPT',
        inserted: [
          { key: '7', recno: 6, values: { RECEIPT: '7', LATE_FEE: (weeks * 50).toFixed(2) } },
        ],
        deleted: [],
        updated: [],
        schema: { added: [], removed: [] },
      },
    },
    unchanged: [],
    addedTables: [],
    removedTables: [],
  };
  return diff;
};
const step = (typeProbe?: ProbeTyper) =>
  exorciseStep({
    db: t.db,
    bundleFor: async (p) => graveyardBundle(p),
    ...(typeProbe ? { typeProbe } : {}),
  });

describe('the exorcise step', () => {
  it('Iqra: probes the late fee in the old app at chosen dates, and finds it counts calendar weeks', async () => {
    const p = await project('iqra');
    const dates: string[] = [];
    const { c, events, logs } = ctx(p);
    const r = (await step(async (s, x, d) => (dates.push(d), calendarWeeks(s, x, d)))(c)) as {
      status: string;
      output: { findings: { code: string }[]; probes: { date: string; lateFee: string | null }[] };
    };
    expect(r.status).toBe('done');
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates.every((d) => /^2001-03-\d\d 10:00:00$/.test(d))).toBe(true);
    expect(r.output.findings.map((f) => f.code)).toContain('date-arithmetic:payment.late_fee');
    expect(
      logs.some((l) =>
        /^Probe: paid on 2001-03-\d\d, the old app charged a late fee of Rs/.test(l),
      ),
    ).toBe(true);
    const rows = await t.db.select().from(exorcisms).where(eq(exorcisms.projectId, p.id));
    expect(rows.map((x) => [x.code, x.severity, x.decision])).toContainEqual([
      'date-arithmetic:payment.late_fee',
      'medium',
      'pending',
    ]);
    expect(events.filter(([type]) => type === 'exorcism')).toHaveLength(rows.length);
  });

  it('Shifa: its findings kept, and a decision already made survives a second run', async () => {
    const p = await project('shifa');
    await step()(ctx(p).c);
    await t.db
      .update(exorcisms)
      .set({ decision: 'keep', decidedAt: new Date() })
      .where(eq(exorcisms.code, 'negative-allowed:medicine.qty'));
    const r = (await step()(ctx(p).c)) as { output: { findings: { code: string }[] } };
    expect(r.output.findings.map((f) => f.code)).toEqual(
      expect.arrayContaining(['two-digit-year:medicine.expiry', 'negative-allowed:medicine.qty']),
    );
    const rows = await t.db.select().from(exorcisms).where(eq(exorcisms.projectId, p.id));
    expect(rows.find((x) => x.code === 'negative-allowed:medicine.qty')!.decision).toBe('keep');
    const y2k = rows.find((x) => x.code === 'two-digit-year:medicine.expiry')!;
    expect(y2k).toMatchObject({ severity: 'high', decision: 'pending' });
    expect(y2k.titleUr).toMatch(/[\u0600-\u06FF]/);
    expect((y2k.evidence as { evidence: unknown[]; since: number }).since).toBe(1998);
  });

  it('a probe the old app cannot be driven through is logged, and no late fee is judged', async () => {
    const p = await project('iqra');
    const { c, logs } = ctx(p);
    const r = (await step(async () => {
      throw new Error('No key path from fp_x to fp_y');
    })(c)) as { output: { findings: { code: string }[] } };
    expect(r.output.findings.map((f) => f.code)).not.toContain('date-arithmetic:payment.late_fee');
    expect(logs.some((l) => l.includes('could not be typed: No key path'))).toBe(true);
  });

  it('says why it did nothing: no Soul', async () => {
    expect(await step()(ctx(await project('shifa', null)).c)).toEqual({
      status: 'skipped',
      reason: 'This project has no Soul yet',
    });
  });
});
