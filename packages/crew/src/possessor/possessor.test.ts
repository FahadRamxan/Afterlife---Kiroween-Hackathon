import { readDbf } from '@afterlife/dbf';
import { recordAction } from '@afterlife/emulator';
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm } from '../llm/runtime';
import type { LlmRequest } from '../llm/types';
import { guideFromSeance } from './guide';
import { possess, type PossessorObservation } from './possessor';
import { bootMiniShop } from './testing/mini-shop';
import { dataValueChooser, llmValueChooser } from './values';

const FAST = { stableMs: 1, pollMs: 1, maxWaitMs: 50 };
/** Runs of 100+ steps, each drawing and decoding a full screen: seconds, not milliseconds. */
const HEAVY = 30_000;

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

  it(
    'boundary values (Prompt 49): a code that does not exist and a quantity of 0 are refused',
    async () => {
      const { r, seen } = await run({ probesPerField: 4, maxActions: 150 });
      const refused = Object.fromEntries(r.refused.map((x) => [x.text, x.label]));
      expect(refused['ITEM NOT FOUND']).toBe('Code = ZZZ999 (new-key)');
      expect(refused['BAD QUANTITY']).toBeDefined();
      expect(seen.find((o) => o.label === 'Qty = 0 (zero)')?.errors).toEqual(['BAD QUANTITY']);
      // Each refusal is an observation of its own, with the error on the status line.
      const step = r.refused.find((x) => x.text === 'ITEM NOT FOUND')!.step;
      expect(seen[step - 1]!.errors).toEqual(['ITEM NOT FOUND']);
      // Probing came after a sale got through: the first value of each field is the typical one.
      expect(r.firstChange['SALES.DBF:inserted']).toBeLessThan(step);
    },
    HEAVY,
  );

  it(
    'gives up a walk that no longer leads where it did (found recording Shifa)',
    async () => {
      // A code entered twice in one sale is refused, so the walk "TEA100{Enter}" to the quantity
      // box stops working once the sale has that line. Shifa's real run walked it 40 times.
      const { seen, r } = await run({ probesPerField: 4, maxActions: 150, idleLimit: 1000 });
      let repeats = 0;
      for (let i = 1; i < seen.length; i++) {
        const same = seen[i]!.kind === 'walk' && seen[i]!.keys === seen[i - 1]!.keys;
        repeats = same ? repeats + 1 : 0;
        expect(repeats, `step ${seen[i]!.step}: ${seen[i]!.label}`).toBeLessThan(3);
      }
      expect(r.stoppedBecause).toBe('explored');
    },
    HEAVY,
  );

  it(
    'stops at the action budget, and after N steps with nothing new',
    async () => {
      expect((await run({ maxActions: 3 })).r).toMatchObject({
        steps: 3,
        stoppedBecause: 'budget',
      });
      const idle = await run({ idleLimit: 1 });
      expect(['idle', 'explored']).toContain(idle.r.stoppedBecause);
      expect(idle.r.steps).toBeLessThan((await run()).r.steps);
    },
    HEAVY,
  );

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
    // The shop's four fields: a sale's code and quantity, a new item's name and price.
    expect(new Set(asked)).toEqual(new Set(['Code', 'Qty', 'Name', 'Price']));
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

  it('a guided path is pressed first, before exploring, with its hints (Prompt 50)', async () => {
    const { seen } = await run({
      guide: [{ keys: '2', hint: 'yeh items hain' }, { keys: '{Esc}' }],
    });
    expect(seen.slice(0, 2).map((o) => [o.kind, o.keys, o.hint])).toEqual([
      ['guide', '2', 'yeh items hain'],
      ['guide', '{Esc}', undefined],
    ]);
    expect(seen.slice(2).every((o) => o.kind !== 'guide' && o.hint === undefined)).toBe(true);
  });

  it('a guided step that would leave the program is skipped, though the owner pressed it', async () => {
    const logs: string[] = [];
    const { seen, app } = await run({ guide: [{ keys: '3' }], onLog: (m) => void logs.push(m) });
    expect(seen.some((o) => o.keys === '3')).toBe(false);
    expect(app.state().at).not.toBe('exited');
    expect(logs).toContain('Skipped the owner\'s "3 Exit": it leaves the program');
  });

  it(
    'a blank probe reads "Name = (blank)", once',
    async () => {
      const { seen } = await run({ probesPerField: 3 });
      const blanks = seen.filter((o) => o.label.includes('= (blank)'));
      expect(blanks.length).toBeGreaterThan(0);
      expect(blanks.every((o) => !o.label.includes('(blank) (blank)'))).toBe(true);
    },
    HEAVY,
  );

  it('an owner who quit by a key (Esc or F10 on the first screen) is not followed out of the program', async () => {
    const { emu, app } = await bootMiniShop({ quitKeys: true });
    const seen: PossessorObservation[] = [];
    const logs: string[] = [];
    await possess(emu, {
      values: dataValueChooser,
      record: FAST,
      maxActions: 6,
      onObservation: (o) => void seen.push(o),
      onLog: (m) => void logs.push(m),
      // Esc on Items only goes back; on the menu, Esc and F10 would quit this app.
      guide: [{ keys: '2' }, { keys: '{Esc}' }, { keys: '{Esc}' }, { keys: '{F10}' }],
    });
    expect(seen.filter((o) => o.kind === 'guide').map((o) => o.keys)).toEqual(['2', '{Esc}']);
    expect(app.state().at).not.toBe('exited');
    expect(logs).toContain('Skipped the owner\'s "Esc on the first screen": it leaves the program');
    expect(logs).toContain('Skipped the owner\'s "F10=Quit": it leaves the program');
  });

  it(
    'exploring an app that quits on Esc or F10 at its menu never quits it',
    async () => {
      const { emu, app } = await bootMiniShop({ quitKeys: true });
      const seen: PossessorObservation[] = [];
      const r = await possess(emu, {
        values: dataValueChooser,
        record: FAST,
        onObservation: (o) => void seen.push(o),
      });
      expect(app.state().at).not.toBe('exited');
      expect(seen.some((o) => o.keys === '{F10}')).toBe(false);
      expect(r.stoppedBecause).toBe('explored');
    },
    HEAVY,
  );

  it(
    "Prompt 50 done when: guided by the owner's séance, the save is reached in fewer steps than blind",
    async () => {
      // The owner's séance: Items, A, a name, a price. Recorded on the shop one key at a time.
      const owner = await bootMiniShop();
      const keys = ['2', 'A', ...'TAPAL CHAI', '{Enter}', ...'45', '{Enter}', '{Esc}'];
      const seance = [];
      for (const k of keys) seance.push(await recordAction(owner.emu, k, FAST));
      const guide = guideFromSeance(seance);
      expect(guide.map((g) => g.keys)).toEqual([
        '2',
        'A',
        'TAPAL CHAI{Enter}',
        '45{Enter}',
        '{Esc}',
      ]);

      // The same settings for both, and no idle stop: each runs until everything is tried.
      const same = { probesPerField: 3, maxActions: 200, idleLimit: 1000 };
      const blind = await run(same);
      const guided = await run({ ...same, guide });
      const blindAt = blind.r.firstChange['ITEMS.DBF:inserted'];
      const guidedAt = guided.r.firstChange['ITEMS.DBF:inserted'];
      expect(blindAt).toBeGreaterThan(0);
      expect(guidedAt).toBe(4);
      expect(guidedAt).toBeLessThan(blindAt!);
      // Then it explores the gaps: the sale the owner did not show is found and saved too.
      expect(guided.r.firstChange['SALES.DBF:inserted']).toBeGreaterThan(guidedAt!);
      expect(guided.r.stoppedBecause).toBe('explored');
    },
    HEAVY,
  );
});
