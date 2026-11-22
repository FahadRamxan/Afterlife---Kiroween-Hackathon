// @spec oracle-proof#4.1 The prove step (Prompt 70): the proof on the project's newest Soul, a
// proof_case event per case, the run and its cases kept, the first difference shrunk.
import { eq, insertSoulVersion, proofCases, proofRuns, projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { vesselOldApp } from '@afterlife/oracle';
import { numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL } from '@afterlife/soul/examples/shifa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graveyardBundle } from './possess';
import { proveStep, seedOf } from './prove-step';
import type { StepContext } from './registry';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});
const bundle = graveyardBundle({ source: 'graveyard', sourceApp: 'shifa' })!;
/** The old app as it really runs; the project's Soul may differ from it. */
const OLD = SHIFA_AS_IT_RUNS_SOUL;
const ROUNDED_GST: Soul = {
  ...OLD,
  rules: OLD.rules.map((r) =>
    r.id === 'gst-17-truncated'
      ? { ...r, expression: 'round((bill.subtotal - bill.discount) * 0.17, 2)' }
      : r,
  ),
};

async function project(soul: Soul | null) {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source: 'graveyard', sourceApp: 'shifa' })
    .returning();
  if (soul)
    await insertSoulVersion(t.db, p!.id, (v, parent) => {
      const s = numberSoul(soul, p!.id, v, parent);
      return { ir: s, specMarkdown: specRequirements(s) };
    });
  return p!;
}
function ctx(p: { id: string }) {
  const logs: string[] = [];
  const events: [string, Record<string, unknown>][] = [];
  const c: StepContext = {
    projectId: p.id,
    project: { name: 'Shifa', source: 'graveyard', sourceApp: 'shifa', dosTime: null },
    step: 'prove',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async (type, payload) => void events.push([type, payload as Record<string, unknown>]),
    log: async (m) => void logs.push(m),
  };
  return { c, logs, events };
}
const step = (numRuns = 30) =>
  proveStep({
    db: t.db,
    bundleFor: async () => bundle,
    numRuns,
    lanes: 2,
    shrinkMs: 20_000,
    oldApp: (_soul, records, today) => async (work) => work(vesselOldApp(OLD, records, today)),
  });

describe('the prove step', () => {
  it('proves the Soul case by case: an event per case, the run and its cases kept', async () => {
    const p = await project(OLD);
    const { c, events, logs } = ctx(p);
    const r = await step()(c);
    expect(r).toMatchObject({
      status: 'done',
      output: { soulVersion: 1, seed: seedOf(p.id), numRuns: 30, failed: 0, counterexample: null },
    });
    const out = (r as { output: { passed: number; skipped: number; proofRunId: string } }).output;
    expect(out.passed + out.skipped).toBe(30);
    const cases = events.filter(([type]) => type === 'proof_case').map(([, e]) => e);
    expect(cases).toHaveLength(30);
    expect(cases.every((e) => e.of === 30 && ['pass', 'skip'].includes(e.outcome as string))).toBe(
      true,
    );
    // Running totals on each: the last says them all.
    expect(cases.at(-1)).toMatchObject({ done: 30, failed: 0, skipped: out.skipped });
    // A bill's case carries the record each side wrote, for the split screen.
    const bill = cases.find((e) => e.actionId === 'save-bill' && e.outcome === 'pass')!;
    expect(bill.vessel).toEqual(bill.old);
    expect((bill.vessel as Record<string, string>).BILL_NO).toMatch(/^9807-\d{4}$/);
    const [run] = await t.db.select().from(proofRuns).where(eq(proofRuns.id, out.proofRunId));
    expect(run).toMatchObject({ status: 'passed', caseCount: 30, failed: 0, passed: out.passed });
    expect(
      await t.db.select().from(proofCases).where(eq(proofCases.proofRunId, run!.id)),
    ).toHaveLength(30);
    expect(logs.at(-1)).toMatch(/^30 cases: \d+ the same, 0 different, \d+ skipped$/);
  });

  it('a Soul that rounds GST is caught, shrunk and explained', async () => {
    const p = await project(ROUNDED_GST);
    const { c, events, logs } = ctx(p);
    const r = await step(60)(c);
    const out = (
      r as {
        output: {
          failed: number;
          proofRunId: string;
          counterexample: {
            index: number;
            inputs: { lines: unknown[] };
            explanation: string;
            reproduced: boolean;
          };
        };
      }
    ).output;
    expect(r.status).toBe('done');
    expect(out.failed).toBeGreaterThan(0);
    expect(out.counterexample.reproduced).toBe(true);
    // No bigger than the case that first differed (often smaller: a line alone may not differ).
    const first = events.find(
      ([type, e]) => type === 'proof_case' && e.index === out.counterexample.index,
    )![1] as { inputs: { lines: unknown[] } };
    expect(out.counterexample.inputs.lines.length).toBeLessThanOrEqual(first.inputs.lines.length);
    expect(out.counterexample.explanation).toMatch(
      /^Old app charged Rs \d+\.\d\d GST, new app charged Rs \d+\.\d\d, on a bill of Rs /,
    );
    expect(events.some(([type, e]) => type === 'proof_case' && e.outcome === 'fail')).toBe(true);
    expect(logs).toContain(`Counterexample: ${out.counterexample.explanation}`);
    const [run] = await t.db.select().from(proofRuns).where(eq(proofRuns.id, out.proofRunId));
    expect(run!.status).toBe('failed');
    const rows = await t.db.select().from(proofCases).where(eq(proofCases.proofRunId, run!.id));
    const shrunk = rows.find((x) => x.idx === out.counterexample.index)!;
    expect(shrunk.passed).toBe(false);
    expect(shrunk.explanation).toBe(out.counterexample.explanation);
  });

  it('says why it did nothing: no Soul, no actions, no old app', async () => {
    expect(await step()(ctx(await project(null)).c)).toEqual({
      status: 'skipped',
      reason: 'This project has no Soul yet',
    });
    expect(await step()(ctx(await project({ ...OLD, actions: [] })).c)).toEqual({
      status: 'skipped',
      reason: 'The Soul has no actions to prove yet',
    });
    const p = await project(OLD);
    expect(await proveStep({ db: t.db, bundleFor: async () => bundle })(ctx(p).c)).toEqual({
      status: 'skipped',
      reason: 'This worker has no emulator to run the old app in',
    });
  });
});
