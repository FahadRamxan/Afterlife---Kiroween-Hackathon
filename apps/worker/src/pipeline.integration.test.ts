// Prompt 39 "done when": the full pipeline on Shifa in under 10 minutes. The real worker, real
// pg-boss on Postgres 16, the real Shifa EXE in headless js-dos. Steps whose agent is not built
// yet end "skipped" and say so; possess explores Shifa (Prompt 48); the Oracle proves the Soul it
// found on the real app (Prompt 70), with 12 cases here (PROVE_CASES) to keep the run short.
// real-jsdos: startWorker boots Shifa in its HeadlessPool.
import { createBoss, eq, listEvents, observations, PIPELINE, projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { ScreenWireSchema, fromWire, gridText } from '@afterlife/screen';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runPipeline, waitForPipeline } from './pipeline';
import { startWorker } from './worker';

const TEN_MINUTES = 10 * 60_000;
vi.setConfig({ testTimeout: TEN_MINUTES + 60_000 });

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(() => t.drop());

describe('the pipeline on the real Shifa', () => {
  it('runs possess to exorcise in order and finishes within 10 minutes', async () => {
    process.env.PROVE_CASES = '12';
    const worker = await startWorker({
      databaseUrl: t.url,
      pollingIntervalSeconds: 0.5,
      log: () => {},
    });
    const boss = createBoss(t.url, { background: false });
    await boss.start();
    try {
      const [p] = await t.db
        .insert(projects)
        .values({ name: 'Shifa Medical Store', source: 'graveyard', sourceApp: 'shifa' })
        .returning();
      const started = Date.now();
      await runPipeline(boss, t.db, p!.id);
      const s = await waitForPipeline(t.db, p!.id, TEN_MINUTES);
      expect(Date.now() - started).toBeLessThan(TEN_MINUTES);
      // A failed step says which and why.
      expect(s.steps.filter((x) => x.status === 'failed')).toEqual([]);
      expect(s.status).toBe('done');
      expect(s.steps.map((x) => x.step)).toEqual([...PIPELINE]);
      for (const step of s.steps) expect(['done', 'skipped']).toContain(step.status);
      // Possession explored Shifa (Prompt 48), and kept every action as an observation.
      expect(s.steps[0]!.status).toBe('done');
      const out = s.steps[0]!.output as { screens: number; steps: number; saves: number };
      expect(out.screens).toBeGreaterThanOrEqual(5);
      expect(out.saves).toBeGreaterThan(0);
      const kept = await t.db.select().from(observations).where(eq(observations.projectId, p!.id));
      const probe = (o: (typeof kept)[number]) =>
        (o.hint as { from?: string } | null)?.from === 'probe';
      expect(kept.filter((o) => !probe(o))).toHaveLength(out.steps);
      // Archaeology then typed its probe bills into the old app (review of 51-60, finding 3); each
      // step of them is kept too, labelled with the probe it was for.
      const probes = kept.filter(probe);
      expect(probes.length).toBeGreaterThan(0);
      // Threshold probes ("bill.subtotal = 5000"), and the refusal probes of Prompt 81: a line at
      // the stock and one over it.
      const hints = probes.map((o) => (o.hint as { text: string }).text);
      for (const h of hints)
        expect(h).toMatch(/^probe: (bill\.|bill_item\.qty against medicine\.qty$)/);
      expect(hints).toContain('probe: bill_item.qty against medicine.qty');

      // The steps ran in order, and possess read the real main menu.
      const events = await listEvents(t.db, p!.id, { limit: 500 });
      const started_ = events
        .filter((e) => e.type === 'step' && (e.payload as { state: string }).state === 'started')
        .map((e) => (e.payload as { step: string }).step);
      expect(started_).toEqual([...PIPELINE]);
      // The proof ran on the real app: a case event for each of its cases.
      const prove = s.steps.find((x) => x.step === 'prove')!;
      expect(prove.status).toBe('done');
      const proof = prove.output as {
        numRuns: number;
        passed: number;
        failed: number;
        skipped: number;
      };
      expect(proof.numRuns).toBe(12);
      expect(proof.passed + proof.failed + proof.skipped).toBe(12);
      expect(events.filter((e) => e.type === 'proof_case')).toHaveLength(12);
      const screen = events.find((e) => e.type === 'screen')!;
      const grid = fromWire(ScreenWireSchema.parse((screen.payload as { grid: unknown }).grid));
      expect(gridText(grid).join('\n')).toMatch(/SHIFA MEDICAL STORE[\s\S]*MAIN MENU/);
    } finally {
      await boss.stop({ graceful: false });
      await worker.stop();
      delete process.env.PROVE_CASES;
    }
  });
});
