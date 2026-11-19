// Prompt 48: the Possessor explores the real Shifa EXE (js-dos v8 in headless Chromium) on its
// own. Done when it reaches every screen of the main menu, and makes at least one save on each
// screen that has one: a bill on New Bill, a customer on Customers (Stock and Daily Report only
// show). The model is the fake one (unit tests never call the network); it only names values.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recordAction, waitForStableScreen } from '@afterlife/emulator';
import { HeadlessPool } from '@afterlife/emulator/headless';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm } from '../llm/runtime';
import type { LlmRequest } from '../llm/types';
import { guideFromSeance } from './guide';
import { possess, type PossessResult, type PossessorObservation } from './possessor';
import { dataValueChooser, llmValueChooser } from './values';

vi.setConfig({ testTimeout: 600_000 });
const ROOT = resolve(__dirname, '../../../..');
const SHIFA = new Uint8Array(readFileSync(resolve(ROOT, 'apps/web/public/graveyard/shifa.jsdos')));
const pool = new HeadlessPool({ size: 1, cycles: 60000 });
afterAll(async () => {
  await pool.close();
});

/** What a sensible model would answer for each of Shifa's fields. */
const ANSWERS: [RegExp, string][] = [
  [/^Code$/, 'PAN500'],
  [/^Qty$/, '2'],
  [/^Customer ID/, ''],
  [/^Name$/, 'ALI RAZA'],
  [/^Phone$/, '051-4567890'],
];

describe('the Possessor on the real Shifa', () => {
  it('reaches every menu screen, and saves a bill and a customer, without leaving the app', async () => {
    const asked: string[] = [];
    const client = new FakeLlmClient((req: LlmRequest) => {
      const text = (req.messages[0]!.content[0] as { text: string }).text;
      const field = /^Field: (.*)$/m.exec(text)![1]!;
      asked.push(field);
      return fakeToolUse('answer', { value: ANSWERS.find(([re]) => re.test(field))?.[1] ?? '1' });
    });
    const log = new MemoryLlmCallLog();
    const llm = new CrewLlm({ client, log, projectId: 'shifa-test', budgetTokens: 1_000_000 });
    const seen: PossessorObservation[] = [];
    const r = await pool.use(
      SHIFA,
      async (emu) => {
        await waitForStableScreen(emu, {
          maxWaitMs: 60_000,
          until: (s) => s.text.some((l) => l.includes('MAIN MENU')),
        });
        const result = await possess(emu, {
          values: llmValueChooser(llm),
          maxActions: 120,
          onObservation: (o) => void seen.push(o),
        });
        // Still running: the menu answers after the exploration.
        const end = await waitForStableScreen(emu);
        return { result, endTitle: end.screen.model.title?.name };
      },
      { dosTime: '1998-07-15 10:00:00' },
    );
    const titles = new Set(r.result.graph.nodes.map((n) => n.title));
    for (const t of ['MAIN MENU', 'NEW BILL', 'STOCK', 'CUSTOMERS', 'DAILY REPORT'])
      expect(titles, `${t} in ${[...titles].join(', ')}`).toContain(t);
    // A bill was saved (BILLS and BILLITEM got a record, MEDICINE's stock changed)...
    expect(r.result.firstChange).toHaveProperty(['BILLS.DBF:inserted']);
    expect(r.result.firstChange).toHaveProperty(['BILLITEM.DBF:inserted']);
    expect(r.result.firstChange).toHaveProperty(['MEDICINE.DBF:changed']);
    // ...and a customer was added.
    expect(r.result.firstChange).toHaveProperty(['CUSTOMER.DBF:inserted']);
    // Exit (5) was never chosen, and the app is still up.
    expect(seen.some((o) => o.keys === '5')).toBe(false);
    expect(r.endTitle).toBeTruthy();
    // The model was asked only for field values, every call was logged.
    expect(new Set(asked)).toEqual(
      new Set(['Code', 'Qty', 'Customer ID (blank = walk-in)', 'Name', 'Phone']),
    );
    expect(log.calls.every((c) => c.agent === 'possessor' && c.status === 'ok')).toBe(true);
    console.log(
      `Shifa: ${r.result.screens} screens, ${r.result.steps} steps, ${r.result.saves} saves, stopped: ${r.result.stoppedBecause}`,
    );
    blind = r.result;
  });

  it('Prompt 50: guided by a real séance, it adds the customer in fewer steps than blind', async () => {
    expect(blind, 'the blind run above').toBeDefined();
    // The owner's séance, recorded on the real Shifa one key at a time, as the séance recorder does.
    const keys = ['3', 'A', ...'ALI RAZA', '{Enter}', ...'0514567890', '{Enter}'];
    const seance = await pool.use(
      SHIFA,
      async (emu) => {
        await waitForStableScreen(emu, {
          maxWaitMs: 60_000,
          until: (s) => s.text.some((l) => l.includes('MAIN MENU')),
        });
        const out = [];
        for (const k of keys) out.push(await recordAction(emu, k));
        return out;
      },
      { dosTime: '1998-07-15 10:00:00' },
    );
    const guide = guideFromSeance(seance);
    expect(guide.map((g) => g.keys)).toEqual(['3', 'A', 'ALI RAZA{Enter}', '0514567890{Enter}']);
    const guided = await pool.use(
      SHIFA,
      async (emu) => {
        await waitForStableScreen(emu, {
          maxWaitMs: 60_000,
          until: (s) => s.text.some((l) => l.includes('MAIN MENU')),
        });
        return possess(emu, { values: dataValueChooser, maxActions: 120, guide });
      },
      { dosTime: '1998-07-15 10:00:00' },
    );
    const blindAt = blind!.firstChange['CUSTOMER.DBF:inserted']!;
    const guidedAt = guided.firstChange['CUSTOMER.DBF:inserted']!;
    console.log(`Shifa customer saved at step ${guidedAt} guided, ${blindAt} blind`);
    expect(guidedAt).toBe(4);
    expect(guidedAt).toBeLessThan(blindAt);
    // Then it explores the gaps: the bill the owner did not show is found and saved too.
    expect(guided.firstChange['BILLS.DBF:inserted']).toBeGreaterThan(guidedAt);
  });
});

let blind: PossessResult | undefined;
