import { readDbf } from '@afterlife/dbf';
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm } from '../llm/runtime';
import type { LlmRequest } from '../llm/types';
import { possess, type PossessorObservation } from './possessor';
import { bootMiniShop } from './testing/mini-shop';
import { dataValueChooser, llmValueChooser } from './values';

const FAST = { stableMs: 1, pollMs: 1, maxWaitMs: 50 };

async function run(opts: Partial<Parameters<typeof possess>[1]> = {}) {
  const { emu, app } = await bootMiniShop();
  const seen: PossessorObservation[] = [];
  const r = await possess(emu, {
    values: dataValueChooser,
    record: FAST,
    onObservation: (o) => void seen.push(o),
    ...opts,
  });
  return { emu, app, r, seen };
}

describe('possess on the mini shop', () => {
  it('finds every screen, saves a sale, and never leaves the program', async () => {
    const { r, seen, emu, app } = await run();
    const titles = r.graph.nodes.map((n) => n.title).sort();
    expect(titles).toEqual(expect.arrayContaining(['ITEMS', 'MAIN MENU', 'NEW SALE']));
    expect(r.stoppedBecause).toBe('explored');
    expect(app.state().at).not.toBe('exited');
    // A sale was saved: SALES.DBF has a record and the stock went down.
    const sales = readDbf(await emu.readFile('SALES.DBF')).records;
    expect(sales).toHaveLength(1);
    expect(r.firstChange['SALES.DBF:inserted']).toBeGreaterThan(0);
    expect(r.firstChange['ITEMS.DBF:changed']).toBe(r.firstChange['SALES.DBF:inserted']);
    expect(seen.find((o) => o.changed.includes('SALES.DBF'))!.label).toBe('F2=Save sale');
    expect(r.saves).toBeGreaterThanOrEqual(1);
    // Exit (menu item 3) was never pressed, and Esc never on the first screen.
    expect(seen.some((o) => o.keys === '3')).toBe(false);
    for (const o of seen)
      if (o.keys === '{Esc}') expect(o.screenBefore.fingerprint).not.toBe(r.graph.root);
  });

  it('records each step as an observation with its screens, keys and what changed', async () => {
    const { seen, r } = await run();
    expect(seen.map((o) => o.step)).toEqual(seen.map((_, i) => i + 1));
    expect(seen).toHaveLength(r.steps);
    const first = seen[0]!;
    expect(first).toMatchObject({
      kind: 'explore',
      label: '1 New Sale',
      newScreen: true,
      keys: '1',
    });
    expect(first.screenBefore.model.title?.name).toBe('MAIN MENU');
    // Every edge in the graph came from an observation.
    for (const e of r.graph.edges)
      expect(
        seen.some(
          (o) =>
            o.screenBefore.fingerprint === e.from &&
            o.screenAfter.fingerprint === e.to &&
            o.keys === e.keys,
        ),
      ).toBe(true);
  });

  it('a value the app refuses is an observation too, with its error line', async () => {
    let n = 0;
    const values = {
      source: 'data' as const,
      // The first code is not a real item.
      choose: async (ctx: Parameters<typeof dataValueChooser.choose>[0]) =>
        ctx.field.label === 'Code' && n++ === 0 ? 'NOPE' : dataValueChooser.choose(ctx),
    };
    const { seen } = await run({ values });
    const refused = seen.find((o) => o.errors.length)!;
    expect(refused.label).toBe('Code = NOPE');
    expect(refused.errors).toEqual(['ITEM NOT FOUND']);
  });

  it('stops at the action budget, and after N steps with nothing new', async () => {
    expect((await run({ maxActions: 3 })).r).toMatchObject({ steps: 3, stoppedBecause: 'budget' });
    const idle = await run({ idleLimit: 1 });
    expect(['idle', 'explored']).toContain(idle.r.stoppedBecause);
    expect(idle.r.steps).toBeLessThan((await run()).r.steps);
  });

  it('stops when the run is aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    expect((await run({ signal: ctl.signal })).r).toMatchObject({
      steps: 0,
      stoppedBecause: 'aborted',
    });
  });

  it('asks the model only for field values, and types what it proposes', async () => {
    const asked: string[] = [];
    const client = new FakeLlmClient((req: LlmRequest) => {
      const text = (req.messages[0]!.content[0] as { text: string }).text;
      const field = /^Field: (.*)$/m.exec(text)![1]!;
      asked.push(field);
      return fakeToolUse('answer', {
        value: field === 'Code' ? 'SUG001' : '3',
        why: 'a real item',
      });
    });
    const llm = new CrewLlm({
      client,
      log: new MemoryLlmCallLog(),
      projectId: 'p',
      budgetTokens: 1e6,
    });
    const { seen, emu } = await run({ values: llmValueChooser(llm) });
    expect(new Set(asked)).toEqual(new Set(['Code', 'Qty']));
    expect(seen.some((o) => o.label === 'Code = SUG001')).toBe(true);
    // Its data files are shown to it, so it can name a real code.
    expect((client.requests[0]!.messages[0]!.content[0] as { text: string }).text).toContain(
      'TEA100',
    );
    const items = readDbf(await emu.readFile('ITEMS.DBF')).records;
    // It went down by the quantities the model proposed (3 a line), from 30.
    const sold = 30 - Number(items.find((i) => i.values.CODE === 'SUG001')!.values.QTY);
    expect(sold).toBeGreaterThan(0);
    expect(sold % 3).toBe(0);
  });

  it('a guided path is pressed first, before exploring (Prompt 50)', async () => {
    const { seen } = await run({ guide: [{ keys: '2' }, { keys: '{Esc}' }] });
    expect(seen.slice(0, 2).map((o) => [o.kind, o.keys])).toEqual([
      ['guide', '2'],
      ['guide', '{Esc}'],
    ]);
  });
});
