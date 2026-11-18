// Prompt 39 "done when": the full pipeline on Shifa in under 10 minutes. The real worker, real
// pg-boss on Postgres 16, the real Shifa EXE in headless js-dos. Steps whose agent is not built
// yet end "skipped" and say so; the case counts are the reduced ones (the proof is Prompt 68).
// real-jsdos: startWorker boots Shifa in its HeadlessPool.
import { createBoss, listEvents, PIPELINE, projects } from '@afterlife/db';
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
      expect(s.status).toBe('done');
      expect(s.steps.map((x) => x.step)).toEqual([...PIPELINE]);
      for (const step of s.steps) expect(['done', 'skipped']).toContain(step.status);
      expect(s.steps[0]!.output).toMatchObject({
        reason: expect.stringMatching(/Exploration is not built yet \(Prompt 48\)/),
      });

      // The steps ran in order, and possess read the real main menu.
      const events = await listEvents(t.db, p!.id, { limit: 500 });
      const started_ = events
        .filter((e) => e.type === 'step' && (e.payload as { state: string }).state === 'started')
        .map((e) => (e.payload as { step: string }).step);
      expect(started_).toEqual([...PIPELINE]);
      const screen = events.find((e) => e.type === 'screen')!;
      const grid = fromWire(ScreenWireSchema.parse((screen.payload as { grid: unknown }).grid));
      expect(gridText(grid).join('\n')).toMatch(/SHIFA MEDICAL STORE[\s\S]*MAIN MENU/);
    } finally {
      await boss.stop({ graceful: false });
      await worker.stop();
    }
  });
});
