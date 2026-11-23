// @spec exorcist#3.1 A recorded run leaves what the live one would (Prompt 75): its findings, so the
// owner can keep or fix them, with their evidence pointing at this project's own observations; and
// its migration counts for the Soul the replay stored.
import type { StoredFinding } from '@afterlife/crew';
import { eq, exorcisms, latestSoulRow, observations, projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRecording, replayStep } from './recording';
import type { StepContext } from './registry';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});
const ctx = (projectId: string, step: StepContext['step']): StepContext => ({
  projectId,
  project: { name: 'Shifa', source: 'graveyard', sourceApp: 'shifa', dosTime: null },
  step,
  attempt: 1,
  force: false,
  signal: new AbortController().signal,
  emit: async () => {},
  log: async () => {},
});

describe('replaying a recorded run', () => {
  it('keeps the findings, the evidence on its own observations, and the migration for its Soul', async () => {
    const rec = loadRecording('shifa')!;
    const [p] = await t.db
      .insert(projects)
      .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa', mode: 'recorded' })
      .returning();
    const id = p!.id;
    for (const step of ['possess', 'archaeology', 'rebirth', 'undertake'] as const) {
      const r = await replayStep(rec, step, t.db, { maxPauseMs: 0 })(ctx(id, step));
      if (step === 'undertake')
        expect((r as { output: { soulVersion: number } }).output.soulVersion).toBe(
          (await latestSoulRow(t.db, id))!.version,
        );
    }
    await replayStep(rec, 'exorcise', t.db, { maxPauseMs: 0 })(ctx(id, 'exorcise'));
    const rows = await t.db.select().from(exorcisms).where(eq(exorcisms.projectId, id));
    const recorded = (
      rec.steps.find((s) => s.step === 'exorcise')!.output as { findings: { code: string }[] }
    ).findings;
    expect(rows.map((r) => r.code).sort()).toEqual(recorded.map((f) => f.code).sort());
    expect(rows.every((r) => r.decision === 'pending')).toBe(true);
    // Evidence on screens points at this project's observations, not the recording's.
    const mine = new Set(
      (
        await t.db
          .select({ id: observations.id })
          .from(observations)
          .where(eq(observations.projectId, id))
      ).map((o) => o.id),
    );
    const refs = rows.flatMap((r) =>
      (r.evidence as StoredFinding).evidence
        .filter((e) => e.kind === 'observation')
        .map((e) => e.ref),
    );
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(mine.has(ref), ref).toBe(true);
    // Replayed again (a step run again): nothing doubled, a decision kept.
    await t.db
      .update(exorcisms)
      .set({ decision: 'keep', decidedAt: new Date() })
      .where(eq(exorcisms.id, rows[0]!.id));
    await replayStep(rec, 'exorcise', t.db, { maxPauseMs: 0 })(ctx(id, 'exorcise'));
    const again = await t.db.select().from(exorcisms).where(eq(exorcisms.projectId, id));
    expect(again).toHaveLength(rows.length);
    expect(again.find((r) => r.id === rows[0]!.id)!.decision).toBe('keep');
  });
});
