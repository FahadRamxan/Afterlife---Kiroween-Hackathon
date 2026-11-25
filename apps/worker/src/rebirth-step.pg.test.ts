// @spec surgeon#2 The rebirth step.
// @spec surgeon#2.1 The rebirth step: the newest Soul compiled into the reborn app (Prompt 63).
import { insertSoulVersion, projects } from '@afterlife/db';
import { freshDatabase, type TestDatabase } from '@afterlife/db/testing';
import { numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import { SHIFA_REFERENCE_SOUL } from '@afterlife/soul/examples/shifa';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graveyardBundle } from './possess';
import { rebirthStep } from './rebirth-step';
import type { StepContext } from './registry';

let t: TestDatabase;
beforeAll(async () => {
  t = await freshDatabase();
});
afterAll(async () => {
  await t.drop();
});

async function project(soul: Soul | null, source: 'graveyard' | 'upload' = 'graveyard') {
  const [p] = await t.db
    .insert(projects)
    .values({ name: 'Shifa', source, sourceApp: source === 'graveyard' ? 'shifa' : 'x.zip' })
    .returning();
  if (soul)
    await insertSoulVersion(t.db, p!.id, (v, parent) => {
      const s = numberSoul(soul, p!.id, v, parent);
      return { ir: s, specMarkdown: specRequirements(s) };
    });
  return p!;
}

function ctx(p: { id: string; source: string; sourceApp: string }) {
  const logs: [string, string | undefined][] = [];
  const c: StepContext = {
    projectId: p.id,
    project: {
      name: 'Shifa',
      source: p.source as 'graveyard',
      sourceApp: p.sourceApp,
      dosTime: null,
    },
    step: 'rebirth',
    attempt: 1,
    force: false,
    signal: new AbortController().signal,
    emit: async () => undefined,
    log: async (m, level) => void logs.push([m, level]),
  };
  return { c, logs };
}

const step = (c: StepContext) =>
  rebirthStep({
    db: t.db,
    bundleFor: async (p) => (p.source === 'graveyard' ? graveyardBundle(p) : null),
  })(c);

describe('the rebirth step', () => {
  it('publishes Shifa’s reference Soul: every rule compiled, both actions smoke-tested', async () => {
    const p = await project(SHIFA_REFERENCE_SOUL);
    const { c, logs } = ctx(p);
    const r = await step(c);
    expect(r).toMatchObject({
      status: 'done',
      output: {
        url: `/vessel/${p.id}`,
        soulVersion: 1,
        published: true,
        actions: [
          { id: 'save-bill', name: 'Save a bill', ok: true },
          { id: 'add-customer', name: 'Add a customer', ok: true },
        ],
        rules: { compiled: SHIFA_REFERENCE_SOUL.rules.length, failed: 0 },
        problems: [],
      },
    });
    const messages = logs.map(([m]) => m);
    expect(messages).toContain(
      `Compiled ${SHIFA_REFERENCE_SOUL.rules.length} rules of Soul version 1`,
    );
    expect(messages).toContain(
      'Smoke test "Save a bill": went through (BILLITEM.DBF 1, BILLS.DBF 1, MEDICINE.DBF 1)',
    );
    expect(messages.at(-1)).toBe(`Reborn: 2 actions published at /vessel/${p.id}`);
  });

  it('a Soul with an action that cannot run: published without it, and says so', async () => {
    const p = await project({
      ...SHIFA_REFERENCE_SOUL,
      rules: SHIFA_REFERENCE_SOUL.rules.filter((x) => x.target !== 'medicine.qty'),
    });
    const { c, logs } = ctx(p);
    const r = await step(c);
    expect(r).toMatchObject({ status: 'done', output: { published: true } });
    expect(logs).toContainEqual([
      'Save a bill is left out: The action save-bill changes medicine, but no rule says how',
      'warn',
    ]);
  });

  it('no action can run: the step fails with the Surgeon’s reasons', async () => {
    const p = await project({
      ...SHIFA_REFERENCE_SOUL,
      actions: SHIFA_REFERENCE_SOUL.actions.filter((a) => a.id === 'save-bill'),
      rules: SHIFA_REFERENCE_SOUL.rules.filter((x) => x.target !== 'medicine.qty'),
    });
    expect(await step(ctx(p).c)).toEqual({
      status: 'failed',
      reason:
        'Save a bill is left out: The action save-bill changes medicine, but no rule says how',
    });
  });

  // @spec learned-certificates#2.2 Not reborn yet is not a failure (Prompt 81).
  it('every action only "not reborn yet": done, nothing published, each listed with what is missing', async () => {
    const p = await project({
      ...SHIFA_REFERENCE_SOUL,
      actions: SHIFA_REFERENCE_SOUL.actions.filter((a) => a.id === 'save-bill'),
      rules: SHIFA_REFERENCE_SOUL.rules.filter((x) => x.target !== 'bill.gst'),
    });
    const { c, logs } = ctx(p);
    const r = (await step(c)) as { status: string; output: Record<string, unknown> };
    expect(r).toMatchObject({ status: 'done', output: { published: false, config: null } });
    expect(r.output.smoke).toEqual([
      expect.objectContaining({ actionId: 'save-bill', notReborn: true, missing: ['bill.GST'] }),
    ]);
    expect(logs.map(([m]) => m)).toContain(
      'Nothing is reborn yet: Save a bill is left out: Not reborn yet: the old app works out bill GST, and no rule says how',
    );
  });

  it('a Soul with no actions yet (a short possession saved nothing): skipped, not failed', async () => {
    const p = await project({ ...SHIFA_REFERENCE_SOUL, actions: [] });
    expect(await step(ctx(p).c)).toEqual({
      status: 'skipped',
      reason: 'The Soul has no actions yet, so there is no app to publish',
    });
  });

  it('no Soul, or no records: skipped, with the reason', async () => {
    expect(await step(ctx(await project(null)).c)).toEqual({
      status: 'skipped',
      reason: 'This project has no Soul yet',
    });
    expect(await step(ctx(await project(SHIFA_REFERENCE_SOUL, 'upload')).c)).toEqual({
      status: 'skipped',
      reason: 'The records of an uploaded app come with the Undertaker',
    });
  });
});
